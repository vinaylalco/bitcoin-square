import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

export function useStrapiQuery<T>(key: string, path: string): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: [key, path],
    queryFn: async (): Promise<T> => {
      const res = await fetch(path);
      if (!res.ok) {
        throw new Error('Failed to fetch');
      }
      return (await res.json()) as T;
    },
  });
}