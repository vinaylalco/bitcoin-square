import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface NewsletterSubList {
  id: number;
  subscribers: string[];
}

interface StrapiCollectionResponse<T> {
  data: T[];
  meta?: unknown;
}

export function useNewsletter() {
  return useQuery<NewsletterSubList | undefined>({
    queryKey: ['newsletter'],
    queryFn: async () => {
      const res = await apiFetch<StrapiCollectionResponse<NewsletterSubList>>(
        '/api/newsletter-sub-lists',
      );
      return res.data[0];
    },
  });
}

export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await apiFetch<StrapiCollectionResponse<NewsletterSubList>>(
        '/api/newsletter-sub-lists',
      );
      const list = res.data[0];
      if (!list) throw new Error('Newsletter list not found');
      const subscribers = list.subscribers ? [...list.subscribers] : [];
      if (!subscribers.includes(email)) subscribers.push(email);
      return apiFetch(`/api/newsletter-sub-lists/${list.id}`, {
        method: 'PUT',
        body: JSON.stringify({ data: { subscribers } }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter'] });
    },
  });
}

export function useUnsubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await apiFetch<StrapiCollectionResponse<NewsletterSubList>>(
        '/api/newsletter-sub-lists',
      );
      const list = res.data[0];
      if (!list) throw new Error('Newsletter list not found');
      const subscribers = list.subscribers
        ? list.subscribers.filter((e) => e !== email)
        : [];
      return apiFetch(`/api/newsletter-sub-lists/${list.id}`, {
        method: 'PUT',
        body: JSON.stringify({ data: { subscribers } }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter'] });
    },
  });
}
