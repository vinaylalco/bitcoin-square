import { useQuery } from "@tanstack/react-query";
import { getLessonPlan } from "../lib/strapi";
import type { LessonPlan } from "../types/lesson-plan";

export function useLessonPlan(locale: string, slug = "education") {
  return useQuery<LessonPlan, Error>({
    queryKey: ["lesson-plan", slug, locale],
    queryFn: () => getLessonPlan(locale, slug),
    placeholderData: (previous) => previous,
  });
}
