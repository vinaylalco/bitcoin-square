import { useQuery } from '@tanstack/react-query';
import { strapiFetch } from '../api/strapi-client';
import { useAuth } from '../context/AuthContext';
import type { LessonPlan } from '../types/lesson-plan';

export interface Purchase {
  id: number;
  paymentStatus: string;
  lessonPlan: LessonPlan;
}

export function useMyPurchases() {
  const { token } = useAuth();
  return useQuery<Purchase[]>({
    queryKey: ['my-purchases'],
    queryFn: async () => {
      return await strapiFetch<Purchase[]>('/api/my-purchases', {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: !!token,
  });
}
