import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { strapiFetch } from '../api/strapi-client';

export function useStrapiQuery<T>(key: string, path: string): UseQueryResult<T> {
  return useQuery({ queryKey: [key, path], queryFn: () => strapiFetch<T>(path) });
}
