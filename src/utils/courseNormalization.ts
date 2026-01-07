import type { User } from "../context/AuthContext";
import type { LessonPlan } from "../types/lesson-plan";
import type { ContentCreatorCourse, LessonPlanCourse, UnifiedCourse } from "../types/course";

function resolveYoutubeEmbed(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("youtube.com/embed/")) {
    return trimmed;
  }
  const youtubeMatch =
    trimmed.match(/[?&]v=([a-zA-Z0-9_-]{6,})/) ||
    trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/) ||
    trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  if (/^[a-zA-Z0-9_-]{6,}$/.test(trimmed)) {
    return `https://www.youtube.com/embed/${trimmed}`;
  }
  return trimmed;
}

export function normalizeLessonPlanCourse(course: LessonPlan): LessonPlanCourse {
  return {
    ...course,
    type: "lessonPlan",
    published: true,
    authorId: null,
    youtubeEmbed: null,
    outline: null,
  };
}

export function normalizeContentCreatorCourse(
  course: ContentCreatorCourse,
): UnifiedCourse {
  const youtubeSource =
    course.youtube ??
    course.videoUrl ??
    course.youtubeId ??
    (course as { youtubeEmbed?: string | null }).youtubeEmbed ??
    null;
  const outline =
    course.outline ??
    (course as { outlineItems?: string[] | null }).outlineItems ??
    null;

  return {
    ...course,
    type: "contentCreator",
    youtubeEmbed: resolveYoutubeEmbed(youtubeSource),
    outline,
  };
}

function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  const rawRoles = (user as { roles?: unknown }).roles;
  if (Array.isArray(rawRoles)) {
    return rawRoles.some((role) =>
      typeof role === "string" ? role.trim().toLowerCase().includes("admin") : false,
    );
  }
  if (typeof rawRoles === "string") {
    return rawRoles.trim().toLowerCase().includes("admin");
  }
  return false;
}

function isCourseAuthor(course: UnifiedCourse, currentUser: User | null): boolean {
  if (!currentUser || course.authorId == null) {
    return false;
  }
  const authorId = String(course.authorId).trim().toLowerCase();
  if (!authorId) {
    return false;
  }
  const identifiers = [
    currentUser.id != null ? String(currentUser.id).trim().toLowerCase() : "",
    currentUser.email?.trim().toLowerCase() ?? "",
    currentUser.username?.trim().toLowerCase() ?? "",
  ].filter(Boolean);
  return identifiers.includes(authorId);
}

export function canViewCourse(course: UnifiedCourse, currentUser: User | null): boolean {
  if (course.type !== "contentCreator") {
    return true;
  }
  if (course.published !== false) {
    return true;
  }
  return isAdminUser(currentUser) || isCourseAuthor(course, currentUser);
}
