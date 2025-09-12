import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export interface NewsletterSubscriber {
  email: string;
}

export interface HomePage {
  id: number;
  documentId: string;
  newsletterSubscribers: NewsletterSubscriber[];
}

interface StrapiSingleResponse<T> {
  data: T;
  meta?: unknown;
}

/**
 * Fetch the current list of newsletter subscribers from the HomePage single type.
 */
export function useNewsletter() {
  return useQuery<NewsletterSubscriber[]>({
    queryKey: ['newsletter'],
    queryFn: async () => {
      const res = await apiFetch<StrapiSingleResponse<HomePage>>(
        '/api/home-page?populate=*',
      );
      return res.data.newsletterSubscribers ?? [];
    },
  });
}

/**
 * Add an email to the newsletterSubscribers array.
 */
export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await apiFetch<StrapiSingleResponse<HomePage>>(
        '/api/home-page?populate=*',
      );
      const subscribers = res.data.newsletterSubscribers
        ? [...res.data.newsletterSubscribers]
        : [];
      if (!subscribers.some((s) => s.email === email)) {
        subscribers.push({ email });
      }
      return apiFetch('/api/home-page', {
        method: 'PUT',
        body: JSON.stringify({
          data: { newsletterSubscribers: subscribers },
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter'] });
    },
  });
}

/**
 * Remove an email from the newsletterSubscribers array.
 */
export function useUnsubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await apiFetch<StrapiSingleResponse<HomePage>>(
        '/api/home-page?populate=*',
      );
      const subscribers = res.data.newsletterSubscribers
        ? res.data.newsletterSubscribers.filter((s) => s.email !== email)
        : [];
      return apiFetch('/api/home-page', {
        method: 'PUT',
        body: JSON.stringify({
          data: { newsletterSubscribers: subscribers },
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter'] });
    },
  });
}

