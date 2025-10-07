import type { Event } from "nostr-tools";

type PublishEmitter = {
  on?: (event: string, callback: (value?: unknown) => void) => void;
  off?: (event: string, callback: (value?: unknown) => void) => void;
};

type PublishResult = PublishEmitter | PromiseLike<unknown> | void;

type PoolLike = {
  publish: (relays: string[], event: Event) => PublishResult;
};

type RelayLike = {
  publish: (event: Event) => PublishResult;
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

export const publishWithPool = async (
  pool: PoolLike,
  relays: string[],
  event: Event,
): Promise<void> => {
  const publication = pool.publish(relays, event);
  await awaitPublishResult(publication);
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
  try {
    await publishWithPool(pool, relays, event);
  } catch (error) {
    console.warn("Failed to replicate event", error);
  }
};
