import { useQuery } from "@tanstack/react-query";
import { strapiFetch } from "../api/strapi-client";
import { mapContentCreatorEntry } from "./useContentCreatorCourses";
import type { ContentCreatorCourse } from "../types/course";

type AnyRecord = Record<string, unknown>;

type StrapiCollectionResponse<T> = {
  data?: T[];
};

export function useContentCreatorCourse(slug: string) {
  return useQuery<ContentCreatorCourse | null, Error>({
    queryKey: ["content-creator-course", slug],
    queryFn: async () => {
      if (!slug) {
        return null;
      }
      const params = new URLSearchParams();
      params.append("filters[slug][$eq]", slug);
      params.append("populate[0]", "coverImage");
      params.append("populate[1]", "author");
      const path = `/api/content-creator-courses?${params.toString()}`;
      const json = await strapiFetch<StrapiCollectionResponse<AnyRecord>>(path);
      const entry = Array.isArray(json?.data) ? json.data[0] : undefined;
      return entry ? mapContentCreatorEntry(entry) : null;
    },
    placeholderData: (previous) => previous,
  });
}
