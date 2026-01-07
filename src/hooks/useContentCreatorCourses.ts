import { useQuery } from "@tanstack/react-query";
import { strapiFetch } from "../api/strapi-client";
import { resolveMedia } from "../lib/strapi";
import type { LessonPlan } from "../types/lesson-plan";
import type { ContentCreatorCourse } from "../types/course";

type AnyRecord = Record<string, unknown>;

type StrapiCollectionResponse<T> = {
  data?: T[];
};

function unwrapEntry(entry: unknown): AnyRecord {
  if (!entry || typeof entry !== "object") {
    return {};
  }
  const record = entry as AnyRecord;
  const attributes = record.attributes;
  if (attributes && typeof attributes === "object") {
    const plain: AnyRecord = { ...(attributes as AnyRecord) };
    if (record.id !== undefined && plain.id === undefined) {
      plain.id = record.id;
    }
    if (record.documentId !== undefined && plain.documentId === undefined) {
      plain.documentId = record.documentId;
    }
    if (record.slug !== undefined && plain.slug === undefined) {
      plain.slug = record.slug;
    }
    return plain;
  }
  return record;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
}

function toSlug(title?: string): string {
  return (
    title
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || ""
  );
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function extractMediaUrl(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return undefined;

  const record = value as AnyRecord;
  if (typeof record.url === "string") {
    return record.url;
  }

  const data = record.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const resolved = extractMediaUrl(
        typeof item === "object" && item
          ? ((item as AnyRecord).attributes as unknown) ?? item
          : item,
      );
      if (resolved) return resolved;
    }
  } else if (data && typeof data === "object") {
    return extractMediaUrl(((data as AnyRecord).attributes as unknown) ?? data);
  }

  return undefined;
}

function resolveAuthorId(record: AnyRecord): number | string | null {
  const candidates: unknown[] = [
    record.authorId,
    record.author_id,
    record.creatorId,
    record.creator_id,
    (record.author as AnyRecord | undefined)?.id,
    (record.author as AnyRecord | undefined)?.data &&
      ((record.author as AnyRecord).data as AnyRecord).id,
    (record.createdBy as AnyRecord | undefined)?.id,
    (record.createdBy as AnyRecord | undefined)?.data &&
      ((record.createdBy as AnyRecord).data as AnyRecord).id,
    (record.user as AnyRecord | undefined)?.id,
    (record.user as AnyRecord | undefined)?.data &&
      ((record.user as AnyRecord).data as AnyRecord).id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" || typeof candidate === "string") {
      return candidate;
    }
  }

  return null;
}

function resolvePublished(record: AnyRecord): boolean | undefined {
  const direct = coerceBoolean(
    record.published ??
      record.isPublished ??
      record.is_published ??
      record.isDraft,
  );
  if (direct !== undefined) {
    return record.isDraft ? !direct : direct;
  }

  const publishedAt = record.publishedAt ?? record.published_at;
  if (typeof publishedAt === "string") {
    return publishedAt.trim().length > 0;
  }

  if (publishedAt instanceof Date) {
    return Number.isFinite(publishedAt.getTime());
  }

  if (publishedAt != null) {
    return Boolean(publishedAt);
  }

  return undefined;
}

export function mapContentCreatorEntry(entry: unknown): ContentCreatorCourse {
  const unwrapped = unwrapEntry(entry);
  const title = coerceString(unwrapped.title) ?? coerceString(unwrapped.name);
  const slug =
    coerceString(unwrapped.slug) ||
    toSlug(title) ||
    (unwrapped.id != null ? String(unwrapped.id) : "");
  const coverUrl = extractMediaUrl(
    unwrapped.coverImage ?? unwrapped.cover_image ?? unwrapped.image,
  );
  const price =
    parseNumber(unwrapped.price ?? unwrapped.Price ?? unwrapped.price_usd) ??
    parseNumber((unwrapped.course as AnyRecord | undefined)?.price);
  const stripePriceId =
    coerceString(unwrapped.stripePriceId) ||
    coerceString(unwrapped.stripe_price_id);
  const stripeProductId =
    coerceString(unwrapped.stripeProductId) ||
    coerceString(unwrapped.stripe_product_id);
  const isPaid =
    coerceBoolean(unwrapped.isPaid ?? unwrapped.is_paid) ??
    coerceBoolean((unwrapped.course as AnyRecord | undefined)?.isPaid) ??
    false;
  const modules = Array.isArray(unwrapped.modules)
    ? unwrapped.modules
    : Array.isArray((unwrapped.course as AnyRecord | undefined)?.modules)
      ? ((unwrapped.course as AnyRecord).modules as LessonPlan["modules"])
      : [];

  return {
    id: typeof unwrapped.id === "number" ? unwrapped.id : undefined,
    documentId: coerceString(unwrapped.documentId),
    title,
    slug,
    description: coerceString(unwrapped.description),
    coverImage: resolveMedia(coverUrl),
    modules,
    price,
    stripePriceId,
    stripeProductId,
    isPaid,
    type: "contentCreator",
    published: resolvePublished(unwrapped),
    authorId: resolveAuthorId(unwrapped),
    youtube: coerceString(unwrapped.youtube) ?? null,
    youtubeId:
      coerceString(unwrapped.youtubeId) ??
      coerceString(unwrapped.youtube_id) ??
      null,
    videoUrl:
      coerceString(unwrapped.videoUrl) ??
      coerceString(unwrapped.video_url) ??
      null,
    outline:
      (unwrapped.outline as string | string[] | undefined) ??
      (unwrapped.outlineItems as string[] | undefined) ??
      null,
  };
}

export function useContentCreatorCourses() {
  return useQuery<ContentCreatorCourse[], Error>({
    queryKey: ["content-creator-courses"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("populate[0]", "coverImage");
      params.append("populate[1]", "author");
      const path = `/api/content-creator-courses?${params.toString()}`;
      const json = await strapiFetch<StrapiCollectionResponse<AnyRecord>>(path);
      const entries = Array.isArray(json?.data) ? json.data : [];
      return entries.map((entry) => mapContentCreatorEntry(entry));
    },
    placeholderData: (prev) => prev,
  });
}
