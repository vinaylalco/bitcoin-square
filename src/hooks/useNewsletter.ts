import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface NewsletterSubList {
  id: number;
  subscribers: string[];
}

export function useNewsletter() {
  return useQuery<NewsletterSubList>({
    queryKey: ['newsletter'],
    queryFn: async () => {
      const res = await apiFetch<NewsletterSubList[]>(
        '/api/newsletter-sub-lists',
      );
      return res[0];
    },
  });
}

export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await apiFetch<NewsletterSubList[]>(
        '/api/newsletter-sub-lists',
      );
      const list = res[0];
      const subscribers = list.subscribers || [];
      if (!subscribers.includes(email)) subscribers.push(email);
      return apiFetch(`/api/newsletter-sub-lists/${list.id}`, {
        method: 'PUT',
        body: JSON.stringify({ subscribers }),
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
      const res = await apiFetch<NewsletterSubList[]>(
        '/api/newsletter-sub-lists',
      );
      const list = res[0];
      const subscribers = (list.subscribers || []).filter((e) => e !== email);
      return apiFetch(`/api/newsletter-sub-lists/${list.id}`, {
        method: 'PUT',
        body: JSON.stringify({ subscribers }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter'] });
    },
  });
}
