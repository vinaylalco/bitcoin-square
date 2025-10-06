import { useMutation } from "@tanstack/react-query";
import { createLessonPlanCheckoutSession } from "../lib/strapi";

interface CheckoutPayload {
  lessonPlanId: string;
  priceId: string;
}

interface CheckoutSessionResponse {
  id: string;
}

export function useCreateCheckoutSession() {
  return useMutation<CheckoutSessionResponse, Error, CheckoutPayload>({
    mutationFn: ({ lessonPlanId, priceId }) =>
      createLessonPlanCheckoutSession(lessonPlanId, priceId),
  });
}
