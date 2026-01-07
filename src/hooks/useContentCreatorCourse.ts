import { useQuery } from "@tanstack/react-query";
import { strapiFetch } from "../api/strapi-client";
import { useAuth } from "../context/AuthContext";
import { isAdminUser, mapContentCreatorEntry } from "./useContentCreatorCourses";
import type { ContentCreatorCourse } from "../types/course";

type AnyRecord = Record<string, unknown>;

type StrapiCollectionResponse<T> = {
  data?: T[];
};

export function useContentCreatorCourse(slug: string) {
  const { user, token } = useAuth();
  const isAdmin = isAdminUser(user);

  return useQuery<ContentCreatorCourse | null, Error>({
    queryKey: ["content-creator-course", slug, user?.id ?? null, isAdmin],
    queryFn: async () => {
      if (!slug) {
        return null;
      }
      const baseParams = new URLSearchParams();
      baseParams.append("filters[slug][$eq]", slug);
      baseParams.append("populate[0]", "coverImage");
      baseParams.append("populate[1]", "author");

      const fetchCourses = async (
        params: URLSearchParams,
        includeAuth: boolean,
      ): Promise<ContentCreatorCourse[]> => {
        const path = `/api/content-creator-courses?${params.toString()}`;
        const json = await strapiFetch<StrapiCollectionResponse<AnyRecord>>(
          path,
          includeAuth && token
            ? { headers: { Authorization: `Bearer ${token}` } }
            : undefined,
        );
        const entries = Array.isArray(json?.data) ? json.data : [];
        return entries.map((entry) => mapContentCreatorEntry(entry));
      };

      const publishedParams = new URLSearchParams(baseParams);
      publishedParams.set("status", "published");
      const publishedCourses = await fetchCourses(publishedParams, Boolean(token));

      const merged = new Map<string | number, ContentCreatorCourse>();
      for (const course of publishedCourses) {
        const key = course.id ?? course.documentId ?? course.slug;
        if (key != null && !merged.has(key)) {
          merged.set(key, course);
        }
      }

      const canRequestDrafts = Boolean(user && token);
      if (canRequestDrafts) {
        const draftParams = new URLSearchParams(baseParams);
        draftParams.set("status", "draft");
        if (!isAdmin) {
          draftParams.append("filters[author][id][$eq]", String(user.id));
        }
        const draftCourses = await fetchCourses(draftParams, true);
        for (const course of draftCourses) {
          const key = course.id ?? course.documentId ?? course.slug;
          if (key != null && !merged.has(key)) {
            merged.set(key, course);
          }
        }
      }

      for (const course of merged.values()) {
        if (course.slug === slug) {
          return course;
        }
      }

      return null;
    },
    placeholderData: (previous) => previous,
  });
}
