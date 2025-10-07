import { useMemo } from "react";
import { finalizeEvent, getPublicKey, type Event, type EventTemplate } from "nostr-tools";

import { useAuth } from "../context/AuthContext";

const hexToBytes = (hex: string): Uint8Array => {
  const normalized = hex.trim().replace(/^0x/i, "");
  if (normalized.length % 2 !== 0) {
    throw new Error("Nostr private key must be valid hex");
  }
  const result = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    result[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return result;
};

export interface UseNostrAccountResult {
  ready: boolean;
  pubkey: string | null;
  privkey: Uint8Array | null;
  error: string | null;
  signEvent: ((template: EventTemplate) => Promise<Event>) | null;
}

export const useNostrAccount = (): UseNostrAccountResult => {
  const { user, nostrPrivKey } = useAuth();

  return useMemo(() => {
    if (!nostrPrivKey) {
      return {
        ready: false,
        pubkey: user?.nostrPublicKey ?? null,
        privkey: null,
        error: null,
        signEvent: null,
      };
    }

    try {
      const privkey = hexToBytes(nostrPrivKey);
      const derivedPubkey = user?.nostrPublicKey ?? getPublicKey(privkey);
      const signEvent = async (template: EventTemplate) => finalizeEvent(template, privkey);
      return {
        ready: true,
        pubkey: derivedPubkey,
        privkey,
        error: null,
        signEvent,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Invalid nostr key material", error);
      return {
        ready: false,
        pubkey: user?.nostrPublicKey ?? null,
        privkey: null,
        error: message,
        signEvent: null,
      };
    }
  }, [nostrPrivKey, user?.nostrPublicKey]);
};
