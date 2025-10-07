import type { Event } from "nostr-tools";

type PublishEmitter = {
  on?: (event: string, callback: (value?: unknown) => void) => void;
  off?: (event: string, callback: (value?: unknown) => void) => void;
};

type PublishResult = PublishEmitter | PromiseLike<unknown> | void;

type RelayLike = {
  publish: (event: Event) => PublishResult;
};

type PoolLike = {
  ensureRelay: (url: string) => Promise<RelayLike>;
};

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" && value !== null && "then" in value &&
  typeof (value as PromiseLike<unknown>).then === "function";

const cleanupEmitter = (emitter: PublishEmitter | null, handlers: [string, (value?: unknown) => void][]) => {
  if (!emitter?.off) {
    return;
  }
  for (const [event, handler] of handlers) {
    emitter.off(event, handler);
  }
};

const waitForEmitter = (emitter: PublishEmitter | null): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!emitter?.on) {
      resolve();
      return;
    }

    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanupEmitter(emitter, handlers);
      action();
    };

    const handleOk = () => finish(resolve);
    const handleSeen = () => finish(resolve);
    const handleFailed = (reason?: unknown) =>
      finish(() => reject(reason ?? new Error("Publish failed")));
    const handleError = (reason?: unknown) =>
      finish(() => reject(reason ?? new Error("Publish error")));

    const handlers: [string, (value?: unknown) => void][] = [
      ["ok", handleOk],
      ["seen", handleSeen],
      ["failed", handleFailed],
      ["error", handleError],
    ];

    for (const [event, handler] of handlers) {
      emitter.on(event, handler);
    }

    setTimeout(() => finish(resolve), 10_000);
  });

export const awaitPublishResult = async (result: PublishResult): Promise<void> => {
  if (!result) {
    return;
  }
  if (isPromiseLike(result)) {
    await result;
    return;
  }
  await waitForEmitter(result);
};

const publishToRelay = async (
  pool: PoolLike,
  relayUrl: string,
  event: Event,
): Promise<void> => {
  const relay = await pool.ensureRelay(relayUrl);
  const publication = relay.publish(event);
  await awaitPublishResult(publication);
};

export const publishWithPool = async (
  pool: PoolLike,
  relays: string[],
  event: Event,
): Promise<void> => {
  if (relays.length === 0) {
    throw new Error("No relays configured for publish");
  }

  const [primary, ...others] = relays;
  await publishToRelay(pool, primary, event);

  if (others.length === 0) {
    return;
  }

  await Promise.all(
    others.map((relayUrl) =>
      publishToRelay(pool, relayUrl, event).catch((error) => {
        console.warn(`Failed to publish to relay ${relayUrl}`, error);
      }),
    ),
  );
};

export const publishWithRelay = async (relay: RelayLike, event: Event): Promise<void> => {
  const publication = relay.publish(event);
  await awaitPublishResult(publication);
};

export const replicateWithPool = async (
  pool: PoolLike,
  relays: string[],
  event: Event,
): Promise<void> => {
  await Promise.all(
    relays.map((relayUrl) =>
      publishToRelay(pool, relayUrl, event).catch((error) => {
        console.warn(`Failed to replicate event to relay ${relayUrl}`, error);
      }),
    ),
  );
};
