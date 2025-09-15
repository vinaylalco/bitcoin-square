import { useMutation } from '@tanstack/react-query';
import { strapiFetch } from '../api/strapi-client';
import { useAuth } from '../context/AuthContext';

interface CheckoutResponse {
  session: { url: string };
}

export function useCheckoutLessonPlan(lessonPlanId?: number | string) {
  const { token } = useAuth();
  return useMutation({
    mutationFn: async () => {
      return await strapiFetch<CheckoutResponse>('/api/payment/checkout', {
        method: 'POST',
        body: JSON.stringify({ lessonPlanId }),
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: (data) => {
      const url = data.session?.url;
      if (url) {
        window.location.href = url;
      }
    },
  });
}
