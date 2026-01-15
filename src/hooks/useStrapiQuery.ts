import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStrapiJson } from "../api/strapiClient";

type StrapiQueryResult<T> = {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Failed to fetch Strapi data");

export function useStrapiQuery<T>(key: string, path: string): StrapiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchStrapiJson<T>(path, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }
      setData(response ?? null);
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }
      setData(null);
      setError(normalizeError(err));
    } finally {
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }
      setIsLoading(false);
    }
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    void run();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [key, run]);

  return { data, isLoading, error, refetch: run };
}
