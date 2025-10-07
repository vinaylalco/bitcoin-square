import { SimplePool, type Event, type Filter, type EventTemplate } from "nostr-tools";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
];

export type RoomSubscription = {
  close: () => void;
};

export type RoomEventHandler = (event: Event) => void;

export class NostrClient {
  private pool: SimplePool;

  constructor(private relays: string[] = DEFAULT_RELAYS) {
    this.pool = new SimplePool();
  }

  async getPublicKey() {
    if (!window.nostr) {
      throw new Error("NIP-07 provider not available");
    }
    return window.nostr.getPublicKey();
  }

  subscribeToRoom(roomId: string, handler: RoomEventHandler): RoomSubscription {
    const filters: Filter[] = [
      { kinds: [1], "#t": [`room:${roomId}`] },
      { kinds: [20001], "#t": [`room:${roomId}`] },
    ];
    const sub = this.pool.sub(this.relays, filters);
    sub.on("event", handler);
    return {
      close: () => sub.unsub(),
    };
  }

  async publish(template: EventTemplate) {
    if (!window.nostr) {
      throw new Error("NIP-07 provider not available");
    }
    const signed = await window.nostr.signEvent(template);
    await this.pool.publish(this.relays, signed);
    return signed;
  }

  dispose() {
    this.pool.close(this.relays);
  }
}

export const nostrClient = new NostrClient();
