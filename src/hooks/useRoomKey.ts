import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ensureRoomKey,
  forgetRoomKey,
  getRoomCryptoKey,
  getRoomKeyBase64,
  hasRoomKey,
} from "../utils/aes";

export interface UseRoomKeyOptions {
  roomId: string | null;
  isPrivate: boolean;
}

export interface UseRoomKeyResult {
  key: CryptoKey | null;
  base64: string | null;
  hasKey: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  ensure: () => Promise<CryptoKey>;
  forget: () => Promise<void>;
}

const cryptoUnavailableError = new Error("WebCrypto API is not available for room key operations");

export const useRoomKey = ({ roomId, isPrivate }: UseRoomKeyOptions): UseRoomKeyResult => {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [hasKeyState, setHasKeyState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetState = useCallback(() => {
    if (!mountedRef.current) return;
    setKey(null);
    setBase64(null);
    setHasKeyState(false);
    setError(null);
  }, []);

  const loadKey = useCallback(async () => {
    if (!roomId || !isPrivate) {
      resetState();
      return;
    }

    setLoading(true);
    try {
      const available = await hasRoomKey(roomId);
      if (!available) {
        if (mountedRef.current) {
          setHasKeyState(false);
          setKey(null);
          setBase64(null);
        }
        return;
      }

      const [cryptoKey, serialized] = await Promise.all([
        getRoomCryptoKey(roomId),
        getRoomKeyBase64(roomId),
      ]);

      if (mountedRef.current) {
        setKey(cryptoKey);
        setBase64(serialized);
        setHasKeyState(true);
      }
    } catch (loadError) {
      console.error("Failed to load room key", loadError);
      if (mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setHasKeyState(false);
        setKey(null);
        setBase64(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [isPrivate, resetState, roomId]);

  useEffect(() => {
    loadKey().catch((loadError) => {
      console.error("Room key load failure", loadError);
    });
  }, [loadKey]);

  const ensureKey = useCallback(async () => {
    if (!roomId) {
      throw new Error("A room id is required to ensure a key");
    }
    if (!isPrivate) {
      throw new Error("ensureKey should only be called for private rooms");
    }

    try {
      await ensureRoomKey(roomId);
      const cryptoKey = await getRoomCryptoKey(roomId);
      const serialized = await getRoomKeyBase64(roomId);
      if (mountedRef.current) {
        setKey(cryptoKey);
        setBase64(serialized);
        setHasKeyState(true);
        setError(null);
      }
      return cryptoKey;
    } catch (ensureError) {
      console.error("Failed to ensure room key", ensureError);
      throw ensureError;
    }
  }, [isPrivate, roomId]);

  const forget = useCallback(async () => {
    if (!roomId) return;
    try {
      await forgetRoomKey(roomId);
    } catch (forgetError) {
      console.error("Failed to forget room key", forgetError);
      throw forgetError;
    } finally {
      resetState();
    }
  }, [resetState, roomId]);

  return useMemo(
    () => ({
      key,
      base64,
      hasKey: hasKeyState,
      loading,
      error,
      refresh: loadKey,
      ensure: ensureKey,
      forget,
    }),
    [base64, ensureKey, error, forget, hasKeyState, key, loadKey, loading],
  );
};

export const assertCryptoAvailable = () => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw cryptoUnavailableError;
  }
};

