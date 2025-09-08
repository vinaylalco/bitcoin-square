import { useQuery } from "@tanstack/react-query";
import { getLessonPlans } from "../lib/strapi";
import type { LessonPlan } from "../types/lesson-plan";

export function useLessonPlans(locale: string) {
  return useQuery<LessonPlan[], Error>({
    queryKey: ["lesson-plans", locale],
    queryFn: () => getLessonPlans(locale),
    placeholderData: (prev) => prev,
  });
}
