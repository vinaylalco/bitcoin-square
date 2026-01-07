import type { LessonPlan } from "./lesson-plan";

export type LessonPlanCourse = LessonPlan & {
  type: "lessonPlan";
  published?: boolean;
  authorId?: number | string | null;
  youtubeEmbed?: string | null;
  outline?: string | string[] | null;
};

export type ContentCreatorCourse = LessonPlan & {
  type: "contentCreator";
  published?: boolean;
  authorId?: number | string | null;
  youtube?: string | null;
  youtubeId?: string | null;
  videoUrl?: string | null;
  youtubeEmbed?: string | null;
  outline?: string | string[] | null;
};

export type UnifiedCourse = LessonPlanCourse | ContentCreatorCourse;
