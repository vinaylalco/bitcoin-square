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

type Nip44Module = {
  encrypt: (plaintext: string, conversationKey: Uint8Array, nonce?: Uint8Array) => string | Promise<string>;
  decrypt: (payload: string, conversationKey: Uint8Array) => string | Promise<string>;
  getConversationKey?: (privkey: Uint8Array, pubkey: string) => Uint8Array | Promise<Uint8Array>;
  utils?: {
    getConversationKey?: (privkey: Uint8Array, pubkey: string) => Uint8Array | Promise<Uint8Array>;
  };
};

type Nip19Module = {
  decode: (value: string) => { type: string; data: string | Uint8Array };
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
  nip44?: Nip44Module;
  nip19?: Nip19Module;
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
  const record = candidate as Record<string, unknown>;
  const nip04Candidate = record.nip04 as Nip04Module | undefined;
  const nip44Candidate = record.nip44 as Nip44Module | undefined;
  const nip19Candidate = record.nip19 as Nip19Module | undefined;

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
    nip44:
      nip44Candidate &&
      typeof nip44Candidate.encrypt === "function" &&
      typeof nip44Candidate.decrypt === "function"
        ? nip44Candidate
        : undefined,
    nip19: nip19Candidate && typeof nip19Candidate.decode === "function" ? nip19Candidate : undefined,
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

export const decodeBech32 = async (value: string) => {
  const module = await loadModule();
  if (!module.nip19) {
    throw new Error("nostr-tools nip19 helpers are unavailable");
  }
  return module.nip19.decode(value);
};

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

const resolveNip44 = async (): Promise<Required<Nip44Module>> => {
  const mod = await loadModule();
  if (!mod.nip44) {
    throw new Error("nostr-tools nip44 helpers are unavailable");
  }

  const nip44 = mod.nip44;
  const conversationResolver =
    typeof nip44.getConversationKey === "function"
      ? nip44.getConversationKey.bind(nip44)
      : typeof nip44.utils?.getConversationKey === "function"
        ? nip44.utils.getConversationKey.bind(nip44.utils)
        : null;

  if (!conversationResolver) {
    throw new Error("nostr-tools nip44 helpers are missing getConversationKey");
  }

  const encrypt = nip44.encrypt.bind(nip44);
  const decrypt = nip44.decrypt.bind(nip44);

  return {
    encrypt: async (plaintext: string, conversationKey: Uint8Array, nonce?: Uint8Array) =>
      (await encrypt(plaintext, conversationKey, nonce)) as string,
    decrypt: async (payload: string, conversationKey: Uint8Array) =>
      (await decrypt(payload, conversationKey)) as string,
    getConversationKey: async (privkey: Uint8Array, pubkey: string) =>
      (await conversationResolver(privkey, pubkey)) as Uint8Array,
    utils: { getConversationKey: conversationResolver },
  };
};

export const nip44GetConversationKey = async (privkey: Uint8Array, pubkey: string): Promise<Uint8Array> => {
  const mod = await resolveNip44();
  return mod.getConversationKey(privkey, pubkey);
};

export const nip44Encrypt = async (
  plaintext: string,
  conversationKey: Uint8Array,
  nonce?: Uint8Array,
): Promise<string> => {
  const mod = await resolveNip44();
  return mod.encrypt(plaintext, conversationKey, nonce);
};

export const nip44Decrypt = async (payload: string, conversationKey: Uint8Array): Promise<string> => {
  const mod = await resolveNip44();
  return mod.decrypt(payload, conversationKey);
};
