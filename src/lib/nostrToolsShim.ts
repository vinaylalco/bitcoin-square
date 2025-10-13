/*
 * Lazy loader around the `nostr-tools` package so builds succeed even when the
 * package cannot be bundled locally (for example, in restricted environments).
 * The loader fetches the ESM bundle from esm.sh at runtime and proxies the
 * subset of the API our app relies on.
 */

export interface Event {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface EventTemplate {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface Filter {
  ids?: string[];
  kinds?: number[];
  authors?: string[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [key: `#${string}`]: string[] | number[] | undefined;
}

export interface SubscribeHandlers {
  onevent?: (event: Event) => void;
  oneose?: (relay?: string) => void;
  onerror?: (error: unknown, relay?: string) => void;
  onnotice?: (notice: string, relay?: string) => void;
  onclose?: (reason?: unknown) => void;
}

export interface Subscription {
  close: () => void;
  [key: string]: unknown;
}

export interface RelayLike {
  publish: (event: Event) => unknown;
  on?: (event: string, handler: (value?: unknown) => void) => void;
  off?: (event: string, handler: (value?: unknown) => void) => void;
  close?: () => void;
}

type Nip04Module = {
  encrypt: (secretKey: string, pubkey: string, plaintext: string) => Promise<string>;
  decrypt: (secretKey: string, pubkey: string, ciphertext: string) => Promise<string>;
};

type SimplePoolModule = {
  SimplePool: new () => {
    subscribeMany: (relays: string[], filters: Filter[], opts?: SubscribeHandlers) => Subscription;
    ensureRelay: (url: string) => Promise<RelayLike>;
    close: (relays?: string[]) => void;
  };
  finalizeEvent: (template: EventTemplate, privkey: Uint8Array) => Event;
  getPublicKey: (privkey: Uint8Array) => string;
  nip04?: Nip04Module;
};

const MODULE_URL = "https://esm.sh/nostr-tools@2.10.4?bundle";

declare global {
  interface Window {
    NostrTools?: Partial<SimplePoolModule>;
  }
}

let cachedModule: SimplePoolModule | null = null;
let modulePromise: Promise<SimplePoolModule> | null = null;

const normalizeModule = (input: unknown): SimplePoolModule => {
  const candidate =
    (input as SimplePoolModule | undefined) ??
    ((input as { default?: unknown } | undefined)?.default as SimplePoolModule | undefined);

  if (!candidate || typeof candidate !== "object") {
    throw new Error("nostr-tools module is unavailable");
  }

  const { SimplePool, finalizeEvent, getPublicKey } = candidate as Record<string, unknown>;
  const nip04Candidate = (candidate as Record<string, unknown>).nip04 as Nip04Module | undefined;

  if (typeof SimplePool !== "function" || typeof finalizeEvent !== "function" || typeof getPublicKey !== "function") {
    throw new Error("nostr-tools module is missing required exports");
  }

  return {
    SimplePool: SimplePool as SimplePoolModule["SimplePool"],
    finalizeEvent: finalizeEvent as SimplePoolModule["finalizeEvent"],
    getPublicKey: getPublicKey as SimplePoolModule["getPublicKey"],
    nip04:
      nip04Candidate && typeof nip04Candidate.encrypt === "function" && typeof nip04Candidate.decrypt === "function"
        ? nip04Candidate
        : undefined,
  };
};

const loadModule = async (): Promise<SimplePoolModule> => {
  if (cachedModule) {
    return cachedModule;
  }

  if (!modulePromise) {
    modulePromise = (async () => {
      if (typeof window !== "undefined" && window.NostrTools) {
        cachedModule = normalizeModule(window.NostrTools);
        return cachedModule;
      }

      const loaded = await import(/* @vite-ignore */ MODULE_URL);
      cachedModule = normalizeModule(loaded);
      return cachedModule;
    })();
  }

  return modulePromise;
};

export const loadNostrTools = () => loadModule();

export class SimplePool {
  private readonly poolPromise: Promise<InstanceType<SimplePoolModule["SimplePool"]>>;

  constructor() {
    this.poolPromise = loadModule().then((mod) => new mod.SimplePool());
  }

  waitUntilReady(): Promise<void> {
    return this.poolPromise.then(() => undefined);
  }

  subscribeMany(relays: string[], filters: Filter[], opts: SubscribeHandlers = {}): Subscription {
    const subscriptionPromise = this.poolPromise.then((pool) => pool.subscribeMany(relays, filters, opts));

    const proxy: Subscription = {
      close: () => {
        subscriptionPromise
          .then((subscription) => subscription.close())
          .catch((error) => {
            if (opts.onerror) {
              opts.onerror(error);
            } else {
              console.warn("Failed to close Nostr subscription", error);
            }
          });
      },
    };

    subscriptionPromise
      .then((subscription) => {
        Object.assign(proxy, subscription);
      })
      .catch((error) => {
        opts.onerror?.(error);
      });

    return proxy;
  }

  ensureRelay(url: string): Promise<RelayLike> {
    return this.poolPromise.then((pool) => pool.ensureRelay(url));
  }

  close(relays?: string[]): void {
    void this.poolPromise
      .then((pool) => pool.close(relays))
      .catch((error) => {
        console.warn("Failed to close Nostr pool", error);
      });
  }
}

export const finalizeEvent = async (template: EventTemplate, privkey: Uint8Array): Promise<Event> => {
  const mod = await loadModule();
  return mod.finalizeEvent(template, privkey);
};

export const getPublicKey = async (privkey: Uint8Array): Promise<string> => {
  const mod = await loadModule();
  return mod.getPublicKey(privkey);
};

export const nip04Encrypt = async (secretKey: string, pubkey: string, plaintext: string): Promise<string> => {
  const mod = await loadModule();
  if (!mod.nip04) {
    throw new Error("nostr-tools nip04 helpers are unavailable");
  }
  return mod.nip04.encrypt(secretKey, pubkey, plaintext);
};

export const nip04Decrypt = async (secretKey: string, pubkey: string, ciphertext: string): Promise<string> => {
  const mod = await loadModule();
  if (!mod.nip04) {
    throw new Error("nostr-tools nip04 helpers are unavailable");
  }
  return mod.nip04.decrypt(secretKey, pubkey, ciphertext);
};
