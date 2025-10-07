import { SimplePool, type Event, type Filter } from "nostr-tools";

export type CacheMirror = {
  persistEvent?: (event: Event) => Promise<void> | void;
  queryEvents?: (filter: Filter) => Promise<Event[]> | Event[];
};

export type PublishResult = {
  event: Event;
  ack: Promise<void>;
};

type QueueItem = {
  event: Event;
  resolve: () => void;
  reject: (error: unknown) => void;
};

type RelayInstance = Awaited<ReturnType<SimplePool["ensureRelay"]>>;

type RelayConnection = {
  url: string;
  relay: RelayInstance | null;
  status: "idle" | "connecting" | "connected";
  attempts: number;
  queue: QueueItem[];
  reconnectTimer?: ReturnType<typeof setTimeout>;
};

export type RelayManagerOptions = {
  fastRelay: string;
  additionalRelays?: string[];
  cacheMirror?: CacheMirror;
  maxBackoffMs?: number;
  baseBackoffMs?: number;
};

type OptimisticListener = (event: Event) => void;

const DEFAULT_BASE_BACKOFF = 500;
const DEFAULT_MAX_BACKOFF = 30_000;

export class NostrRelayManager {
  private readonly pool: SimplePool;
  private readonly fastRelay: RelayConnection;
  private readonly slowRelays: Map<string, RelayConnection>;
  private readonly cacheMirror?: CacheMirror;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly optimisticListeners = new Set<OptimisticListener>();

  constructor({
    fastRelay,
    additionalRelays = [],
    cacheMirror,
    baseBackoffMs = DEFAULT_BASE_BACKOFF,
    maxBackoffMs = DEFAULT_MAX_BACKOFF,
  }: RelayManagerOptions) {
    this.pool = new SimplePool();
    this.fastRelay = this.createConnection(fastRelay);
    this.slowRelays = new Map(
      additionalRelays
        .filter((url) => url !== fastRelay)
        .map((url) => [url, this.createConnection(url)])
    );
    this.cacheMirror = cacheMirror;
    this.baseBackoffMs = baseBackoffMs;
    this.maxBackoffMs = maxBackoffMs;

    void this.ensureConnection(this.fastRelay);
    for (const connection of this.slowRelays.values()) {
      void this.ensureConnection(connection);
    }
  }

  publish(event: Event): PublishResult {
    this.emitOptimistic(event);
    const ack = this.enqueue(this.fastRelay, event);
    void this.replicate(event);
    void this.cacheMirror?.persistEvent?.(event);
    return { event, ack };
  }

  async replicate(event: Event): Promise<void> {
    const tasks = Array.from(this.slowRelays.values()).map((connection) =>
      this.enqueue(connection, event).catch(() => undefined)
    );
    await Promise.allSettled(tasks);
    void this.cacheMirror?.persistEvent?.(event);
  }

  subscribe(filter: Filter, onEvent: (event: Event) => void): { close: () => void } {
    void (async () => {
      const cached = await this.cacheMirror?.queryEvents?.(filter);
      if (cached) {
        for (const event of cached) {
          onEvent(event);
        }
      }
    })();

    const relays = [this.fastRelay.url, ...this.slowRelays.keys()];

    const subscription = this.pool.subscribeMany(relays, [filter], {
      onevent: (event: Event) => {
        void this.cacheMirror?.persistEvent?.(event);
        onEvent(event);
      },
      onerror: (error) => {
        // eslint-disable-next-line no-console
        console.warn("Relay subscription error", error);
      },
    });

    return { close: () => subscription.close() };
  }

  onOptimisticEvent(listener: OptimisticListener): () => void {
    this.optimisticListeners.add(listener);
    return () => this.optimisticListeners.delete(listener);
  }

  close(): void {
    this.fastRelay.relay?.close();
    clearTimeout(this.fastRelay.reconnectTimer);
    for (const connection of this.slowRelays.values()) {
      connection.relay?.close();
      clearTimeout(connection.reconnectTimer);
    }
    this.pool.close([this.fastRelay.url, ...this.slowRelays.keys()]);
    this.optimisticListeners.clear();
  }

  private emitOptimistic(event: Event) {
    for (const listener of this.optimisticListeners) {
      listener(event);
    }
  }

  private createConnection(url: string): RelayConnection {
    return {
      url,
      relay: null,
      status: "idle",
      attempts: 0,
      queue: [],
    };
  }

  private async enqueue(connection: RelayConnection, event: Event): Promise<void> {
    await this.ensureConnection(connection);
    return new Promise<void>((resolve, reject) => {
      connection.queue.push({ event, resolve, reject });
      if (connection.status === "connected") {
        void this.flushQueue(connection);
      }
    });
  }

  private async ensureConnection(connection: RelayConnection): Promise<void> {
    if (connection.status === "connected" || connection.status === "connecting") {
      return;
    }
    connection.status = "connecting";
    await this.connectRelay(connection);
  }

  private async connectRelay(connection: RelayConnection): Promise<void> {
    let relay: RelayInstance | null = null;
    try {
      relay = await this.pool.ensureRelay(connection.url);
      connection.relay = relay;
      connection.status = "connected";
      connection.attempts = 0;
      relay.on?.("disconnect", () => this.handleDisconnect(connection));
      relay.on?.("error", (err: unknown) => this.handleDisconnect(connection, err));
      await this.flushQueue(connection);
    } catch (error) {
      relay?.close?.();
      this.handleDisconnect(connection, error);
    }
  }

  private async flushQueue(connection: RelayConnection): Promise<void> {
    if (connection.status !== "connected" || !connection.relay) {
      return;
    }

    while (connection.queue.length > 0) {
      const item = connection.queue.shift();
      if (!item) break;
      try {
        await connection.relay.publish(item.event);
        item.resolve();
      } catch (error) {
        item.reject(error);
        connection.queue.unshift(item);
        this.handleDisconnect(connection, error);
        break;
      }
    }
  }

  private handleDisconnect(connection: RelayConnection, error?: unknown) {
    if (connection.status === "connecting") {
      connection.attempts += 1;
    } else if (connection.status === "connected") {
      connection.attempts = connection.attempts + 1;
    }

    connection.status = "idle";
    connection.relay?.close();
    connection.relay = null;

    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
    }

    const delay = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * 2 ** Math.min(connection.attempts, 10)
    );

    connection.reconnectTimer = setTimeout(() => {
      void this.ensureConnection(connection);
    }, delay);

    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`Relay ${connection.url} disconnected`, error);
    }
  }
}
