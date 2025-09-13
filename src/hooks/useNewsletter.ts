import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { strapiFetch } from '../lib/api';

export interface Subscriber {
  email: string;
}

export interface NewsletterSubList {
  id: number;
  subscribers: Subscriber[];
}

const ENDPOINT = '/newsletter-sub-lists';

async function fetchNewsletter(): Promise<NewsletterSubList | undefined> {
  const json: any = await strapiFetch<any>(ENDPOINT);
  const data = Array.isArray(json) ? json : json?.data;
  return data ? data[0] : undefined;
}

export function useNewsletter() {
  return useQuery<NewsletterSubList | undefined>({
    queryKey: ['newsletter'],
    queryFn: fetchNewsletter,
  });
}

interface MutationArgs {
  id: number;
  subscribers: Subscriber[];
  email: string;
}

export function useSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, subscribers, email }: MutationArgs) => {
      const exists = subscribers.some((s) => s.email === email);
      const updated = exists ? subscribers : [...subscribers, { email }];
      return await strapiFetch(`${ENDPOINT}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ subscribers: updated }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['newsletter'] }),
  });
}

export function useUnsubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, subscribers, email }: MutationArgs) => {
      const updated = subscribers.filter((s) => s.email !== email);
      return await strapiFetch(`${ENDPOINT}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ subscribers: updated }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['newsletter'] }),
  });
}
