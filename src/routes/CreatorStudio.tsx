import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { getStrapiBaseUrl, strapiFetch, StrapiRequestError } from '../api/strapi-client';
import { useAuth } from '../context/AuthContext';
const EMPTY_COURSE = {
  title: '',
  slug: '',
  description: '',
};

type CreatorMe = {
  contentCreator?: boolean;
  id?: number | string;
  documentId?: string;
};

type CourseRecord = {
  id?: number | string;
  documentId?: string;
  title?: string;
};

type MyCourseRecord = {
  id?: number | string;
  documentId?: string;
  title?: string;
  updatedAt?: string | null;
  updated_at?: string | null;
  author?: { id?: number | string; data?: { id?: number | string } | null } | null;
  authorId?: number | string;
};

type MyCourseItem = {
  id: number | string;
  documentId: string;
  title: string;
  updatedAt?: string | null;
};

type CourseDetailRecord = MyCourseRecord & {
  slug?: string;
  description?: string;
  coverImage?: { id?: number; data?: { id?: number; attributes?: { name?: string } } | null; name?: string } | null;
  lessons?: Array<{
    id?: number | string;
    lessonTitle?: string;
    youtubeEmbedCode?: string;
    lessonText?: LessonTextValue;
  }>;
};

type LessonDraft = {
  id: string;
  lessonTitle: string;
  youtubeEmbedCode: string;
  lessonText: LessonTextValue;
};

const EMPTY_LESSON = (): LessonDraft => ({
  id: crypto.randomUUID?.() ?? `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  lessonTitle: '',
  youtubeEmbedCode: '',
  lessonText: '',
});

type RichTextChild = {
  type: 'text';
  text: string;
};

type RichTextBlock = {
  type: 'paragraph';
  children: RichTextChild[];
};

type LessonTextValue = string | RichTextBlock[];

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isLessonBlank(lesson: LessonDraft): boolean {
  return !lesson.lessonTitle.trim() && !hasLessonTextContent(lesson.lessonText) && !lesson.youtubeEmbedCode.trim();
}

function hasLessonTextContent(lessonText: LessonTextValue): boolean {
  if (Array.isArray(lessonText)) {
    return lessonText.some((block) => block.children?.some((child) => child.text.trim().length > 0));
  }
  return lessonText.trim().length > 0;
}

function lessonTextToBlocks(lessonText: LessonTextValue): RichTextBlock[] | null {
  if (Array.isArray(lessonText)) {
    return hasLessonTextContent(lessonText) ? lessonText : null;
  }
  const trimmed = lessonText.trim();
  if (!trimmed) {
    return null;
  }
  return [
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          text: trimmed,
        },
      ],
    },
  ];
}

function lessonTextToDisplay(lessonText: LessonTextValue): string {
  if (!Array.isArray(lessonText)) {
    return lessonText;
  }
  return lessonText
    .flatMap((block) => block.children?.map((child) => child.text) ?? [])
    .join(' ')
    .trim();
}

function resolveAuthorId(record: MyCourseRecord): number | string | null {
  if (record.authorId != null) {
    return record.authorId;
  }
  const author = record.author;
  if (author?.id != null) {
    return author.id;
  }
  if (author?.data?.id != null) {
    return author.data.id;
  }
  return null;
}

function formatUpdatedAt(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
}

function resolveCoverImageId(record: CourseDetailRecord): number | null {
  const direct = record.coverImage;
  if (direct?.id != null) {
    return direct.id;
  }
  if (direct?.data?.id != null) {
    return direct.data.id;
  }
  return null;
}

function resolveCoverImageName(record: CourseDetailRecord): string | null {
  const direct = record.coverImage;
  if (direct?.name) {
    return direct.name;
  }
  if (direct?.data?.attributes?.name) {
    return direct.data.attributes.name;
  }
  return null;
}

function normalizeCourseRecord(payload: unknown): CourseDetailRecord | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as { attributes?: CourseDetailRecord; id?: number | string; documentId?: string };
  if (record.attributes && typeof record.attributes === 'object') {
    return {
      ...record.attributes,
      id: record.attributes.id ?? record.id,
      documentId: record.attributes.documentId ?? record.documentId,
    };
  }
  return record as CourseDetailRecord;
}

function resolvePublishedAt(payload: unknown): string | null | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const record = payload as { publishedAt?: string | null; attributes?: { publishedAt?: string | null } };
  if (record.publishedAt !== undefined) {
    return record.publishedAt;
  }
  if (record.attributes?.publishedAt !== undefined) {
    return record.attributes.publishedAt;
  }
  return undefined;
}

const MAX_COVER_IMAGE_BYTES = 200 * 1024;
const COVER_IMAGE_RECOMMENDED_ASPECT_RATIO = 35 / 200;
const COVER_IMAGE_HELPER_TEXT =
  'Please upload a small image suitable for the Education page thumbnail. Recommended size is approximately 35px × 200px (or similar aspect ratio). If your image is larger, resize/compress it before uploading. Max file size: 200KB.';

export default function CreatorStudio() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { id: courseIdParam } = useParams<{ id?: string }>();
  const isEditing = Boolean(courseIdParam);
  const [creatorStatus, setCreatorStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorMe | null>(null);

  const [courseDraft, setCourseDraft] = useState({ ...EMPTY_COURSE });
  const [courseStatus, setCourseStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [courseNotice, setCourseNotice] = useState<string | null>(null);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [courseRecord, setCourseRecord] = useState<CourseRecord | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);

  const [lessonDrafts, setLessonDrafts] = useState<LessonDraft[]>([EMPTY_LESSON()]);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [lessonFieldErrors, setLessonFieldErrors] = useState<Record<string, { youtubeEmbedCode?: string }>>({});
  const [youtubeInfoLessonId, setYoutubeInfoLessonId] = useState<string | null>(null);
  const [coverImageId, setCoverImageId] = useState<number | null>(null);
  const [coverImageStatus, setCoverImageStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [coverImageError, setCoverImageError] = useState<string | null>(null);
  const [coverImageName, setCoverImageName] = useState<string | null>(null);
  const [coverImageDimensionWarning, setCoverImageDimensionWarning] = useState<string | null>(null);
  const hasLoggedLessonPayload = useRef(false);

  const [myCourses, setMyCourses] = useState<MyCourseItem[]>([]);
  const [myCoursesStatus, setMyCoursesStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [myCoursesError, setMyCoursesError] = useState<string | null>(null);

  const [courseLoadStatus, setCourseLoadStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [courseLoadError, setCourseLoadError] = useState<string | null>(null);
  const [courseAccessDenied, setCourseAccessDenied] = useState(false);

  const validateYouTubeEmbedCode = useCallback(
    (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const lower = trimmed.toLowerCase();
      if (
        trimmed.includes('<') ||
        trimmed.includes('>') ||
        lower.includes('<iframe') ||
        lower.includes('<script') ||
        lower.includes('src=') ||
        lower.includes('javascript:') ||
        lower.includes('data:')
      ) {
        return t('creatorStudio.errors.youtubeInvalid');
      }
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        return t('creatorStudio.errors.youtubeInvalid');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return t('creatorStudio.errors.youtubeInvalid');
      }
      const hostname = parsed.hostname.toLowerCase();
      const allowedHosts = ['youtube.com', 'www.youtube.com', 'youtu.be'];
      if (!allowedHosts.includes(hostname)) {
        return t('creatorStudio.errors.youtubeEmbedUrl');
      }
      if (!parsed.pathname.startsWith('/embed/')) {
        return t('creatorStudio.errors.youtubeEmbedUrl');
      }
      return null;
    },
    [t],
  );

  useEffect(() => {
    if (!token) {
      setCreatorStatus('idle');
      setCreatorProfile(null);
      return;
    }

    let active = true;
    setCreatorStatus('loading');
    setCreatorError(null);

    strapiFetch<CreatorMe>('/api/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((profile) => {
        if (!active) return;
        setCreatorProfile(profile);
        setCreatorStatus('success');
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : t('creatorStudio.errors.loadUser');
        setCreatorError(message);
        setCreatorStatus('error');
      });

    return () => {
      active = false;
    };
  }, [t, token]);

  const isCreator = useMemo(() => creatorProfile?.contentCreator === true, [creatorProfile]);

  useEffect(() => {
    if (!courseIdParam) {
      setCourseLoadStatus('idle');
      setCourseLoadError(null);
      setCourseAccessDenied(false);
      setCourseRecord(null);
      setCourseDraft({ ...EMPTY_COURSE });
      setLessonDrafts([EMPTY_LESSON()]);
      setCoverImageId(null);
      setCoverImageStatus('idle');
      setCoverImageError(null);
      setCoverImageName(null);
      setCourseNotice(null);
      setCourseError(null);
      setSlugEdited(false);
      return;
    }

    if (!token) {
      setCourseLoadStatus('idle');
      return;
    }

    let active = true;
    setCourseLoadStatus('loading');
    setCourseLoadError(null);
    setCourseAccessDenied(false);

    const buildPopulateParams = () => {
      const params = new URLSearchParams();
      params.append('populate[0]', 'lessons');
      params.append('populate[1]', 'coverImage');
      params.append('populate[2]', 'author');
      return params;
    };

    const fetchCourseByNumericId = async (status: 'draft' | 'published') => {
      const params = buildPopulateParams();
      params.set('status', status);
      params.append('filters[id][$eq]', courseIdParam);
      const response = await strapiFetch<{ data?: CourseDetailRecord[] }>(
        `/api/content-creator-courses?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const records = Array.isArray(response?.data) ? response.data : [];
      return normalizeCourseRecord(records[0]);
    };

    const fetchCourseByDocumentId = async (status: 'draft' | 'published') => {
      const params = buildPopulateParams();
      params.set('status', status);
      params.append('filters[documentId][$eq]', courseIdParam);
      const response = await strapiFetch<{ data?: CourseDetailRecord[] }>(
        `/api/content-creator-courses?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const records = Array.isArray(response?.data) ? response.data : [];
      return normalizeCourseRecord(records[0]);
    };

    const loadCourse = async () => {
      const isNumericId = /^\d+$/.test(courseIdParam);
      if (isNumericId) {
        let record = await fetchCourseByNumericId('draft');
        if (!record) {
          record = await fetchCourseByNumericId('published');
        }
        return record;
      }
      let record = await fetchCourseByDocumentId('draft');
      if (!record) {
        record = await fetchCourseByDocumentId('published');
      }
      return record;
    };

    loadCourse()
      .then((record) => {
        if (!active) return;
        if (!record) {
          setCourseLoadStatus('error');
          setCourseLoadError(t('creatorStudio.errors.loadCourse'));
          return;
        }
        const authorId = resolveAuthorId(record);
        if (authorId != null && user?.id && String(authorId) !== String(user.id)) {
          setCourseAccessDenied(true);
          setCourseLoadStatus('error');
          return;
        }
        setCourseRecord({ id: record.id, documentId: record.documentId, title: record.title });
        setCourseDraft({
          title: record.title ?? '',
          slug: record.slug ?? '',
          description: record.description ?? '',
        });
        setSlugEdited(true);
        const lessonEntries = Array.isArray(record.lessons) ? record.lessons : [];
        if (lessonEntries.length > 0) {
          const nextLessons = lessonEntries.map((lesson) => ({
            id: String(lesson.id ?? crypto.randomUUID?.() ?? `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}`),
            lessonTitle: lesson.lessonTitle ?? '',
            youtubeEmbedCode: lesson.youtubeEmbedCode ?? '',
            lessonText: lesson.lessonText ?? '',
          }));
          setLessonDrafts(nextLessons);
        } else {
          setLessonDrafts([EMPTY_LESSON()]);
        }
        const nextCoverId = resolveCoverImageId(record);
        setCoverImageId(nextCoverId);
        setCoverImageStatus(nextCoverId ? 'success' : 'idle');
        setCoverImageName(resolveCoverImageName(record));
        setCourseLoadStatus('success');
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : t('creatorStudio.errors.loadCourse');
        setCourseLoadError(message);
        setCourseLoadStatus('error');
      });

    return () => {
      active = false;
    };
  }, [courseIdParam, t, token, user?.id]);

  useEffect(() => {
    if (!token || !creatorProfile?.id) {
      setMyCourses([]);
      setMyCoursesStatus('idle');
      setMyCoursesError(null);
      return;
    }

    let active = true;
    setMyCoursesStatus('loading');
    setMyCoursesError(null);

    const fetchCourses = async (status: 'draft' | 'published') => {
      const params = new URLSearchParams();
      params.set('status', status);
      params.append('filters[author][id][$eq]', String(creatorProfile.id));
      params.append('sort', 'updatedAt:desc');
      const response = await strapiFetch<{ data?: MyCourseRecord[] }>(
        `/api/content-creator-courses?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return Array.isArray(response?.data) ? response.data : [];
    };

    Promise.all([fetchCourses('published'), fetchCourses('draft')])
      .then(([publishedCourses, draftCourses]) => {
        if (!active) return;
        const merged = new Map<number | string, MyCourseItem>();
        const upsertCourse = (record: MyCourseRecord, status: 'draft' | 'published') => {
          const attributes = (record as { attributes?: MyCourseRecord }).attributes ?? record;
          const recordId = attributes.id ?? record.id;
          const documentId = attributes.documentId ?? record.documentId;
          const key = documentId ?? recordId;
          if (key == null) return;
          if (!documentId) return;
          const title = attributes.title?.trim() || t('creatorStudio.myCourses.untitled');
          const updatedAt = attributes.updatedAt ?? attributes.updated_at ?? null;
          const existing = merged.get(key);
          if (!existing) {
            merged.set(key, {
              id: key,
              documentId,
              title,
              updatedAt,
            });
            return;
          }
          if (status === 'draft') {
            merged.set(key, {
              ...existing,
              documentId,
              title,
              updatedAt,
            });
          }
        };
        publishedCourses.forEach((record) => upsertCourse(record, 'published'));
        draftCourses.forEach((record) => upsertCourse(record, 'draft'));
        setMyCourses(Array.from(merged.values()));
        setMyCoursesStatus('success');
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : t('creatorStudio.myCourses.error');
        setMyCoursesError(message);
        setMyCoursesStatus('error');
      });

    return () => {
      active = false;
    };
  }, [creatorProfile?.id, t, token]);

  const handleCourseChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;
      setCourseDraft((prev) => {
        const next = { ...prev, [name]: value };
        if (name === 'title' && !slugEdited) {
          next.slug = toSlug(value);
        }
        return next;
      });
      if (name === 'slug') {
        setSlugEdited(true);
      }
      if (courseStatus !== 'idle') {
        setCourseStatus('idle');
      }
      if (courseNotice) {
        setCourseNotice(null);
      }
      if (courseError) {
        setCourseError(null);
      }
    },
    [courseError, courseNotice, courseStatus, slugEdited],
  );

  const validLessonDrafts = useMemo(() => {
    const validLessons: Array<{ lessonTitle: string; lessonText: RichTextBlock[]; youtubeEmbedCode?: string }> = [];
    let hasInvalidLesson = false;

    lessonDrafts.forEach((lesson) => {
      if (isLessonBlank(lesson)) {
        return;
      }
      const lessonTextBlocks = lessonTextToBlocks(lesson.lessonText);
      if (!lesson.lessonTitle.trim() || !lessonTextBlocks) {
        hasInvalidLesson = true;
        return;
      }
      const youtubeError = validateYouTubeEmbedCode(lesson.youtubeEmbedCode);
      if (youtubeError) {
        hasInvalidLesson = true;
        return;
      }
      const youtubeEmbedCode = normalizeText(lesson.youtubeEmbedCode);
      validLessons.push({
        lessonTitle: lesson.lessonTitle.trim(),
        lessonText: lessonTextBlocks,
        ...(youtubeEmbedCode ? { youtubeEmbedCode } : {}),
      });
    });

    return { validLessons, hasInvalidLesson };
  }, [lessonDrafts, validateYouTubeEmbedCode]);

  const buildCoursePayload = useCallback(
    (includeAuthor: boolean) => {
      const payload: {
        title: string;
        slug: string;
        description: string;
        lessons: Array<{ lessonTitle: string; lessonText: RichTextBlock[]; youtubeEmbedCode?: string }>;
        coverImage: number;
        author?: number | string;
      } = {
        title: courseDraft.title.trim(),
        slug: courseDraft.slug.trim(),
        description: courseDraft.description.trim(),
        lessons: validLessonDrafts.validLessons,
        coverImage: coverImageId as number,
      };

      const authorIdentifier = creatorProfile?.documentId ?? creatorProfile?.id ?? user?.id;
      if (includeAuthor && authorIdentifier != null) {
        payload.author = authorIdentifier;
      }

      if (!hasLoggedLessonPayload.current) {
        console.debug('Course lessonText payload sample:', payload.lessons[0]?.lessonText);
        hasLoggedLessonPayload.current = true;
      }

      return payload;
    },
    [courseDraft, coverImageId, creatorProfile?.documentId, creatorProfile?.id, user?.id, validLessonDrafts.validLessons],
  );

  const handleCourseSaveDraft = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const publishErrorMessage = t('creatorStudio.errors.publishUnexpected');
      if (!token) {
        setCourseStatus('error');
        setCourseError(t('creatorStudio.errors.loginToCreate'));
        return;
      }

      if (!courseDraft.title.trim()) {
        setCourseStatus('error');
        setCourseError(t('creatorStudio.errors.titleRequired'));
        return;
      }

      if (!courseDraft.slug.trim()) {
        setCourseStatus('error');
        setCourseError(t('creatorStudio.errors.slugRequired'));
        return;
      }

      if (!courseDraft.description.trim()) {
        setCourseStatus('error');
        setCourseError(t('creatorStudio.errors.descriptionRequired'));
        return;
      }

      if (coverImageStatus === 'uploading') {
        setCourseStatus('error');
        setCourseError(t('creatorStudio.errors.coverUploadWait'));
        return;
      }

      if (!coverImageId) {
        setCourseStatus('error');
        setCourseError(null);
        setCoverImageError(t('creatorStudio.errors.coverRequired'));
        return;
      }

      if (validLessonDrafts.hasInvalidLesson) {
        setCourseStatus('error');
        setCourseError(null);
        setLessonError(t('creatorStudio.errors.lessonInvalid'));
        const nextErrors: Record<string, { youtubeEmbedCode?: string }> = {};
        lessonDrafts.forEach((lesson) => {
          if (isLessonBlank(lesson)) {
            return;
          }
          const youtubeError = validateYouTubeEmbedCode(lesson.youtubeEmbedCode);
          if (youtubeError) {
            nextErrors[lesson.id] = { youtubeEmbedCode: youtubeError };
          }
        });
        setLessonFieldErrors(nextErrors);
        return;
      }

      if (validLessonDrafts.validLessons.length === 0) {
        setCourseStatus('error');
        setCourseError(null);
        setLessonError(t('creatorStudio.errors.lessonRequired'));
        return;
      }

      setCourseStatus('saving');
      setCourseError(null);
      setLessonError(null);
      setCourseNotice(null);

      try {
        if (isEditing && !courseRecord?.documentId) {
          setCourseStatus('error');
          setCourseError(t('creatorStudio.errors.saveDraftFailed'));
          return;
        }
        const courseDocumentId = courseRecord?.documentId;
        const statusParam = 'status=draft';
        const path = courseDocumentId
          ? `/api/content-creator-courses/${courseDocumentId}?${statusParam}`
          : `/api/content-creator-courses?${statusParam}`;
        const attemptRequest = async (includeAuthor: boolean) =>
          strapiFetch<{ data?: CourseRecord }>(path, {
            method: courseDocumentId ? 'PUT' : 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              data: buildCoursePayload(includeAuthor),
            }),
          });

        let response: { data?: CourseRecord };
        try {
          response = await attemptRequest(!courseDocumentId);
        } catch (error) {
          if (error instanceof StrapiRequestError && error.status === 400 && user?.id) {
            response = await attemptRequest(true);
          } else {
            throw error;
          }
        }

        let record = response?.data ?? response;
        const publishedAt = resolvePublishedAt(record);
        if (publishedAt) {
          throw new Error(publishErrorMessage);
        }
        if (!courseDocumentId) {
          const createdId = record?.id;
          if (createdId != null) {
            try {
              const populateParams = new URLSearchParams();
              populateParams.set('populate', 'author');
              populateParams.set('status', 'draft');
              const populated = await strapiFetch<{ data?: CourseRecord }>(
                `/api/content-creator-courses/${createdId}?${populateParams.toString()}`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                },
              );
              record = populated?.data ?? populated ?? record;
              const populatedPublishedAt = resolvePublishedAt(record);
              if (populatedPublishedAt) {
                throw new Error(publishErrorMessage);
              }
            } catch (error) {
              // ignore follow-up fetch failures
              // unless we unexpectedly detect a published course
              if (error instanceof Error && error.message === publishErrorMessage) {
                throw error;
              }
            }
          }
        }
        setCourseRecord(record ?? null);
        setCourseStatus('success');
        setCourseNotice(
          courseDocumentId
            ? t('creatorStudio.notices.draftUpdated')
            : t('creatorStudio.notices.draftSaved'),
        );
      } catch (error) {
        const message =
          error instanceof StrapiRequestError
            ? error.message
            : error instanceof Error
              ? error.message
              : t('creatorStudio.errors.createCourse');
        setCourseStatus('error');
        setCourseError(message);
      }
    },
    [
      buildCoursePayload,
      coverImageId,
      coverImageStatus,
      courseDraft.description,
      courseDraft.slug,
      courseDraft.title,
      isEditing,
      courseRecord,
      lessonDrafts,
      t,
      token,
      user?.id,
      validLessonDrafts,
    ],
  );

  const handleCoverImageChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setCoverImageError(null);
      setCoverImageDimensionWarning(null);
      if (file.size > MAX_COVER_IMAGE_BYTES) {
        event.target.value = '';
        setCoverImageStatus('error');
        setCoverImageError('Image must be 200KB or less. Please resize/compress and try again.');
        setCoverImageId(null);
        setCoverImageName(null);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const previewImage = new Image();
      previewImage.onload = () => {
        const width = previewImage.naturalWidth;
        const height = previewImage.naturalHeight;
        URL.revokeObjectURL(objectUrl);
        if (!width || !height) {
          return;
        }
        const ratio = width / height;
        const isAspectFarOff = ratio < COVER_IMAGE_RECOMMENDED_ASPECT_RATIO * 0.5 ||
          ratio > COVER_IMAGE_RECOMMENDED_ASPECT_RATIO * 2;
        const isSizeLarge = width > 400 || height > 800;
        if (isAspectFarOff || isSizeLarge) {
          setCoverImageDimensionWarning(
            `This image is ${width}×${height}. For best results on the Education page, use ~35×200px (or similar).`,
          );
        }
      };
      previewImage.onerror = () => {
        URL.revokeObjectURL(objectUrl);
      };
      previewImage.src = objectUrl;

      if (!token) {
        setCoverImageStatus('error');
        setCoverImageError(t('creatorStudio.errors.loginToUploadCover'));
        return;
      }

      setCoverImageStatus('uploading');
      setCoverImageId(null);
      setCoverImageName(file.name);

      try {
        const base = getStrapiBaseUrl();
        if (!base) {
          throw new Error(t('creatorStudio.errors.baseUrlMissing'));
        }
        const formData = new FormData();
        formData.append('files', file);
        const response = await fetch(`${base}/api/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
        if (!response.ok) {
          let message = t('creatorStudio.errors.uploadFailedStatus', { status: response.status });
          try {
            const payload = await response.json();
            const extractedMessage =
              typeof payload === 'string'
                ? payload
                : (payload as { error?: { message?: string }; message?: string })?.error?.message ??
                  (payload as { error?: { message?: string }; message?: string })?.message;
            if (extractedMessage && typeof extractedMessage === 'string' && extractedMessage.trim()) {
              message = extractedMessage.trim();
            }
          } catch {
            // ignore payload parsing errors
          }
          throw new Error(message);
        }
        const payload = await response.json();
        const uploaded = Array.isArray(payload) ? payload[0] : payload?.[0];
        const uploadedId = uploaded?.id;
        if (!uploadedId) {
          throw new Error(t('creatorStudio.errors.uploadFailed'));
        }
        setCoverImageId(uploadedId);
        setCoverImageStatus('success');
        setCoverImageError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('creatorStudio.errors.uploadFailed');
        setCoverImageStatus('error');
        setCoverImageError(message);
      }
    },
    [t, token],
  );

  const handleLessonChange = useCallback(
    (id: string, field: keyof LessonDraft, value: string) => {
      setLessonDrafts((prev) =>
        prev.map((lesson) => (lesson.id === id ? { ...lesson, [field]: value } : lesson)),
      );
      if (lessonError) {
        setLessonError(null);
      }
      if (field === 'youtubeEmbedCode') {
        setLessonFieldErrors((prev) => {
          if (!prev[id]?.youtubeEmbedCode) {
            return prev;
          }
          const next = { ...prev };
          next[id] = { ...next[id], youtubeEmbedCode: undefined };
          return next;
        });
      }
    },
    [lessonError],
  );

  const addLessonDraft = useCallback(() => {
    setLessonDrafts((prev) => [...prev, EMPTY_LESSON()]);
  }, []);

  const removeLessonDraft = useCallback((id: string) => {
    setLessonDrafts((prev) => prev.filter((lesson) => lesson.id !== id));
  }, []);

  const handleYoutubeBlur = useCallback((id: string, value: string) => {
    const error = validateYouTubeEmbedCode(value);
    setLessonFieldErrors((prev) => {
      const next = { ...prev };
      if (error) {
        next[id] = { ...next[id], youtubeEmbedCode: error };
      } else if (next[id]) {
        next[id] = { ...next[id], youtubeEmbedCode: undefined };
      }
      return next;
    });
  }, [validateYouTubeEmbedCode]);

  const requiredCourseFieldsValid = useMemo(() => {
    return Boolean(courseDraft.title.trim() && courseDraft.slug.trim() && courseDraft.description.trim());
  }, [courseDraft.description, courseDraft.slug, courseDraft.title]);

  const coverImageReady = coverImageStatus === 'success' && coverImageId !== null;

  const canSaveDraft = useMemo(() => {
    return (
      requiredCourseFieldsValid &&
      coverImageReady &&
      validLessonDrafts.validLessons.length > 0 &&
      !validLessonDrafts.hasInvalidLesson &&
      coverImageStatus !== 'uploading' &&
      courseStatus !== 'saving'
    );
  }, [coverImageReady, coverImageStatus, courseStatus, requiredCourseFieldsValid, validLessonDrafts]);

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">{t('creatorStudio.title')}</h1>
        <p className="text-sm text-neutral-600">{t('creatorStudio.login.prompt')}</p>
        <Link
          to="/membership?view=login"
          className="rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white"
        >
          {t('creatorStudio.login.cta')}
        </Link>
      </div>
    );
  }

  if (creatorStatus === 'loading') {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">{t('creatorStudio.title')}</h1>
        <p className="text-sm text-neutral-600">{t('creatorStudio.access.checking')}</p>
      </div>
    );
  }

  if (creatorStatus === 'error') {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">{t('creatorStudio.title')}</h1>
        <p className="text-sm text-red-500">
          {creatorError ?? t('creatorStudio.errors.loadAccount')}
        </p>
      </div>
    );
  }

  if (!isCreator) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">{t('creatorStudio.title')}</h1>
        <p className="text-sm text-neutral-600">{t('creatorStudio.access.deniedCreator')}</p>
      </div>
    );
  }

  if (isEditing && courseLoadStatus === 'loading') {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">{t('creatorStudio.title')}</h1>
        <p className="text-sm text-neutral-600">{t('creatorStudio.courseLoad.loading')}</p>
      </div>
    );
  }

  if (isEditing && courseAccessDenied) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">{t('creatorStudio.title')}</h1>
        <p className="text-sm text-neutral-600">{t('creatorStudio.access.denied')}</p>
      </div>
    );
  }

  if (isEditing && courseLoadStatus === 'error') {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">{t('creatorStudio.title')}</h1>
        <p className="text-sm text-red-500">
          {courseLoadError ?? t('creatorStudio.errors.loadCourse')}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white text-neutral-900 transition-colors dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-neutral-200 bg-neutral-50 p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand">
            {t('creatorStudio.header.eyebrow')}
          </p>
          <h1 className="mt-4 text-3xl font-semibold">{t('creatorStudio.header.title')}</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            {t('creatorStudio.header.subtitle')}
          </p>
        </header>

        <form onSubmit={handleCourseSaveDraft} className="space-y-10">
          <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold">{t('creatorStudio.steps.courseDetails')}</h2>
              </div>
              {courseStatus === 'success' && courseNotice && (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
                  {courseNotice}
                </span>
              )}
            </div>
            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="course-title" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  {t('creatorStudio.fields.title')}
                </label>
                <input
                  id="course-title"
                  name="title"
                  value={courseDraft.title}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  placeholder={t('creatorStudio.fields.titlePlaceholder')}
                  required
                />
              </div>
              <div>
                <label htmlFor="course-slug" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  {t('creatorStudio.fields.slug')}
                </label>
                <input
                  id="course-slug"
                  name="slug"
                  value={courseDraft.slug}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  placeholder={t('creatorStudio.fields.slugPlaceholder')}
                  required
                />
                <p className="mt-2 text-xs text-neutral-500">{t('creatorStudio.fields.slugHelp')}</p>
              </div>
              <div>
                <label htmlFor="course-description" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  {t('creatorStudio.fields.description')}
                </label>
                <textarea
                  id="course-description"
                  name="description"
                  value={courseDraft.description}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  rows={4}
                  placeholder={t('creatorStudio.fields.descriptionPlaceholder')}
                  required
                />
              </div>
              <div>
                <label htmlFor="course-cover-image" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  {t('creatorStudio.fields.coverImage')}
                </label>
                <input
                  id="course-cover-image"
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm file:mr-4 file:rounded-full file:border-0 file:bg-brand/10 file:px-4 file:py-1 file:text-xs file:font-semibold file:uppercase file:tracking-[0.2em] file:text-brand focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  required={coverImageId == null}
                />
                <p className="mt-2 text-xs text-neutral-500">{COVER_IMAGE_HELPER_TEXT}</p>
                {coverImageStatus === 'uploading' && (
                  <p className="mt-2 text-xs text-neutral-500">{t('creatorStudio.fields.coverUploading')}</p>
                )}
                {coverImageStatus === 'success' && coverImageId && (
                  <p className="mt-2 text-xs text-emerald-500">
                    {t('creatorStudio.fields.coverUploaded', {
                      name: coverImageName ? `: ${coverImageName}` : '',
                      id: coverImageId,
                    })}
                  </p>
                )}
                {coverImageDimensionWarning && (
                  <p className="mt-2 text-xs text-amber-600">{coverImageDimensionWarning}</p>
                )}
                {coverImageError && <p className="mt-2 text-xs text-red-500">{coverImageError}</p>}
              </div>
              {courseError && <p className="text-sm text-red-500">{courseError}</p>}
              {courseRecord && (
                <p className="text-xs text-neutral-500">
                  {t('creatorStudio.courseMeta.courseId', {
                    id: courseRecord.id ?? t('creatorStudio.courseMeta.na'),
                  })}
                  {courseRecord.documentId
                    ? ` · ${t('creatorStudio.courseMeta.documentId', {
                        id: courseRecord.documentId,
                      })}`
                    : ''}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{t('creatorStudio.steps.lessons')}</h2>
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {t('creatorStudio.lessons.helper')}
            </p>
            <div className="mt-6 space-y-6">
              {lessonDrafts.map((lesson, index) => (
                <div
                  key={lesson.id}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      {t('creatorStudio.lessons.lessonLabel', { index: index + 1 })}
                    </h3>
                    {lessonDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLessonDraft(lesson.id)}
                        className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500"
                      >
                        {t('creatorStudio.lessons.remove')}
                      </button>
                    )}
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      {t('creatorStudio.lessons.lessonTitle')}
                    </label>
                    <input
                      value={lesson.lessonTitle}
                      onChange={(event) => handleLessonChange(lesson.id, 'lessonTitle', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      placeholder={t('creatorStudio.lessons.lessonTitlePlaceholder')}
                      required
                    />
                  </div>
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                        {t('creatorStudio.lessons.youtubeLabel')}
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setYoutubeInfoLessonId((prev) => (prev === lesson.id ? null : lesson.id))
                        }
                        className="text-xs font-semibold uppercase tracking-[0.2em] text-brand"
                      >
                        {t('creatorStudio.lessons.youtubeHelpToggle')}
                      </button>
                    </div>
                    <input
                      value={lesson.youtubeEmbedCode}
                      onChange={(event) => handleLessonChange(lesson.id, 'youtubeEmbedCode', event.target.value)}
                      onBlur={(event) => handleYoutubeBlur(lesson.id, event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      placeholder={t('creatorStudio.lessons.youtubePlaceholder')}
                    />
                    {youtubeInfoLessonId === lesson.id && (
                      <div className="mt-2 rounded-2xl border border-neutral-200 bg-white p-3 text-xs text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                        {t('creatorStudio.lessons.youtubeHelpText')}
                      </div>
                    )}
                    {lessonFieldErrors[lesson.id]?.youtubeEmbedCode && (
                      <p className="mt-2 text-xs text-red-500">{lessonFieldErrors[lesson.id]?.youtubeEmbedCode}</p>
                    )}
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      {t('creatorStudio.lessons.lessonText')}
                    </label>
                    <textarea
                      value={lessonTextToDisplay(lesson.lessonText)}
                      onChange={(event) => handleLessonChange(lesson.id, 'lessonText', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      rows={4}
                      placeholder={t('creatorStudio.lessons.lessonTextPlaceholder')}
                      required
                    />
                  </div>
                </div>
              ))}
              {lessonError && <p className="text-sm text-red-500">{lessonError}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={addLessonDraft}
                  className="rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600 transition hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-200"
                >
                  {t('creatorStudio.lessons.addLesson')}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{t('creatorStudio.myCourses.title')}</h2>
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {t('creatorStudio.myCourses.helper')}
            </p>
            <div className="mt-6 space-y-4">
              {myCoursesStatus === 'loading' && (
                <p className="text-sm text-neutral-500">{t('creatorStudio.myCourses.loading')}</p>
              )}
              {myCoursesStatus === 'error' && (
                <p className="text-sm text-red-500">
                  {myCoursesError ?? t('creatorStudio.myCourses.error')}
                </p>
              )}
              {myCoursesStatus !== 'loading' && myCourses.length === 0 && (
                <p className="text-sm text-neutral-500">{t('creatorStudio.myCourses.empty')}</p>
              )}
              {myCourses.length > 0 && (
                <ul className="space-y-3">
                  {myCourses.map((course) => {
                    const updatedAt = formatUpdatedAt(course.updatedAt);
                    return (
                      <li
                        key={course.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-200"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">{course.title}</span>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                            {updatedAt && (
                              <span>
                                {t('creatorStudio.myCourses.lastUpdated', { date: updatedAt })}
                              </span>
                            )}
                          </div>
                        </div>
                        <Link
                          to={`/creator/courses/${course.documentId}/edit`}
                          className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600 transition hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-200"
                        >
                          {t('creatorStudio.myCourses.edit')}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canSaveDraft}
              className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
            >
              {courseStatus === 'saving'
                ? t('creatorStudio.actions.saving')
                : t('creatorStudio.actions.saveDraft')}
            </button>
            {!canSaveDraft && validLessonDrafts.validLessons.length === 0 && (
              <p className="text-xs text-neutral-500">{t('creatorStudio.actions.addLessonHint')}</p>
            )}
            <p className="text-xs text-neutral-500">
              {t('creatorStudio.actions.draftFooter')}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
