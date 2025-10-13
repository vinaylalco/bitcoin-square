import { useEffect, useMemo, useState } from "react";
import { finalizeEvent, getPublicKey, type Event, type EventTemplate } from "../lib/nostrToolsShim";

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
  loading: boolean;
  pubkey: string | null;
  privkey: Uint8Array | null;
  error: string | null;
  signEvent: ((template: EventTemplate) => Promise<Event>) | null;
}

export const useNostrAccount = (): UseNostrAccountResult => {
  const { user, nostrPrivKey, nostrKeyLoading } = useAuth();

  const [privkeyBytes, setPrivkeyBytes] = useState<Uint8Array | null>(null);
  const [derivedPubkey, setDerivedPubkey] = useState<string | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [moduleLoading, setModuleLoading] = useState(false);

  useEffect(() => {
    if (!nostrPrivKey) {
      setPrivkeyBytes(null);
      setDerivedPubkey(null);
      setModuleError(null);
      setModuleLoading(false);
      return;
    }

    try {
      const parsed = hexToBytes(nostrPrivKey);
      setPrivkeyBytes(parsed);
      setModuleError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Invalid nostr key material", error);
      setPrivkeyBytes(null);
      setDerivedPubkey(null);
      setModuleError(message);
      setModuleLoading(false);
    }
  }, [nostrPrivKey]);

  useEffect(() => {
    if (!privkeyBytes || user?.nostrPublicKey) {
      setDerivedPubkey(null);
      setModuleLoading(false);
      return;
    }

    let cancelled = false;
    setModuleLoading(true);

    (async () => {
      try {
        const pub = await getPublicKey(privkeyBytes);
        if (!cancelled) {
          setDerivedPubkey(pub);
          setModuleError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setModuleError(message);
        }
      } finally {
        if (!cancelled) {
          setModuleLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [privkeyBytes, user?.nostrPublicKey]);

  return useMemo(() => {
    if (nostrKeyLoading || moduleLoading) {
      return {
        ready: false,
        loading: true,
        pubkey: user?.nostrPublicKey ?? derivedPubkey,
        privkey: privkeyBytes,
        error: moduleError,
        signEvent: null,
      };
    }

    if (!privkeyBytes) {
      return {
        ready: false,
        loading: false,
        pubkey: user?.nostrPublicKey ?? null,
        privkey: null,
        error: moduleError,
        signEvent: null,
      };
    }

    if (moduleError) {
      return {
        ready: false,
        loading: false,
        pubkey: user?.nostrPublicKey ?? derivedPubkey,
        privkey: privkeyBytes,
        error: moduleError,
        signEvent: null,
      };
    }

    const pubkey = user?.nostrPublicKey ?? derivedPubkey;

    if (!pubkey) {
      return {
        ready: false,
        loading: false,
        pubkey: null,
        privkey: privkeyBytes,
        error: "Nostr tools are still loading",
        signEvent: null,
      };
    }

    const signEvent = async (template: EventTemplate): Promise<Event> => finalizeEvent(template, privkeyBytes);

    return {
      ready: true,
      loading: false,
      pubkey,
      privkey: privkeyBytes,
      error: null,
      signEvent,
    };
  }, [
    derivedPubkey,
    moduleError,
    moduleLoading,
    nostrKeyLoading,
    privkeyBytes,
    user?.nostrPublicKey,
  ]);
};
