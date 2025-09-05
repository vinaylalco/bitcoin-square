import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { strapiFetch } from '../api/strapi-client';

export function useStrapiQuery<T>(key: string, path: string): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: [key, path],
    queryFn: async (): Promise<T> => {
      return await strapiFetch<T>(path);
    },
  });
}