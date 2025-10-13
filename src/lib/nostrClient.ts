import { SimplePool, type Event, type EventTemplate, type Filter } from "./nostrToolsShim";

import { publishWithPool } from "./nostrPublish";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
];

type Signer = (template: EventTemplate) => Promise<Event>;

let activeSigner: Signer | null = null;
let activePubkey: string | null = null;

export const setNostrClientSigner = (signer: Signer | null, pubkey: string | null = null) => {
  activeSigner = signer;
  activePubkey = pubkey;
};

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
    if (!activePubkey) {
      throw new Error("Nostr account is not ready");
    }
    return activePubkey;
  }

  subscribeToRoom(roomId: string, handler: RoomEventHandler): RoomSubscription {
    const filters: Filter[] = [
      { kinds: [1], "#t": [`room:${roomId}`] },
      { kinds: [20001], "#t": [`room:${roomId}`] },
    ];
    const subscription = this.pool.subscribeMany(this.relays, filters, {
      onevent: handler,
      onerror: (error) => {
        console.warn("Relay subscription error", error);
      },
    });
    return {
      close: () => subscription.close(),
    };
  }

  async publish(template: EventTemplate) {
    if (!activeSigner) {
      throw new Error("Nostr signer is not configured");
    }
    const signed = await activeSigner(template);
    await publishWithPool(this.pool, this.relays, signed);
    return signed;
  }

  async broadcast(event: Event) {
    await publishWithPool(this.pool, this.relays, event);
    return event;
  }

  dispose() {
    this.pool.close(this.relays);
  }
}

export const nostrClient = new NostrClient();
