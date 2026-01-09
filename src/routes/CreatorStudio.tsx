import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStrapiBaseUrl, strapiFetch, StrapiRequestError } from '../api/strapi-client';
import { useAuth } from '../context/AuthContext';
const EMPTY_COURSE = {
  title: '',
  slug: '',
  description: '',
};

type CreatorMe = {
  contentCreator?: boolean;
};

type CourseRecord = {
  id?: number | string;
  documentId?: string;
  title?: string;
  publishedAt?: string | null;
  published_at?: string | null;
  published?: boolean;
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

function validateYouTubeEmbedCode(value: string): string | null {
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
    return 'Please enter a valid URL (not embed code).';
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Please enter a valid URL (not embed code).';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Please enter a valid URL (not embed code).';
  }
  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = ['youtube.com', 'www.youtube.com', 'youtu.be'];
  if (!allowedHosts.includes(hostname)) {
    return 'Use a YouTube embed URL (youtube.com/embed/...).';
  }
  if (!parsed.pathname.startsWith('/embed/')) {
    return 'Use a YouTube embed URL (youtube.com/embed/...).';
  }
  return null;
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

export default function CreatorStudio() {
  const { token, user } = useAuth();
  const [creatorStatus, setCreatorStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorMe | null>(null);

  const [courseDraft, setCourseDraft] = useState({ ...EMPTY_COURSE });
  const [courseStatus, setCourseStatus] = useState<
    'idle' | 'saving' | 'publishing' | 'success' | 'error'
  >('idle');
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
  const hasLoggedLessonPayload = useRef(false);

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
        const message = error instanceof Error ? error.message : 'Unable to load user.';
        setCreatorError(message);
        setCreatorStatus('error');
      });

    return () => {
      active = false;
    };
  }, [token]);

  const isCreator = useMemo(() => creatorProfile?.contentCreator === true, [creatorProfile]);

  const courseIdForLessons = useMemo(() => {
    if (!courseRecord) return null;
    return courseRecord.id ?? null;
  }, [courseRecord]);

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

  const resolveCoursePublished = useCallback((record: CourseRecord | null): boolean | null => {
    if (!record) return null;
    if (typeof record.published === 'boolean') {
      return record.published;
    }
    const publishedAt = record.publishedAt ?? record.published_at;
    if (typeof publishedAt === 'string') {
      return publishedAt.trim().length > 0;
    }
    if (publishedAt != null) {
      return Boolean(publishedAt);
    }
    return false;
  }, []);

  const coursePublished = useMemo(() => resolveCoursePublished(courseRecord), [courseRecord, resolveCoursePublished]);

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
  }, [lessonDrafts]);

  const validLessonCount = validLessonDrafts.validLessons.length;

  const buildCoursePayload = useCallback(
    (includeAuthor: boolean) => {
      const payload: {
        title: string;
        slug: string;
        description: string;
        lessons: Array<{ lessonTitle: string; lessonText: RichTextBlock[]; youtubeEmbedCode?: string }>;
        coverImage: number;
        author?: number;
      } = {
        title: courseDraft.title.trim(),
        slug: courseDraft.slug.trim(),
        description: courseDraft.description.trim(),
        lessons: validLessonDrafts.validLessons,
        coverImage: coverImageId as number,
      };

      if (includeAuthor && user?.id) {
        payload.author = user.id;
      }

      if (!hasLoggedLessonPayload.current) {
        console.debug('Course lessonText payload sample:', payload.lessons[0]?.lessonText);
        hasLoggedLessonPayload.current = true;
      }

      return payload;
    },
    [courseDraft, coverImageId, validLessonDrafts.validLessons, user?.id],
  );

  const handleCourseSaveDraft = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!token) {
        setCourseStatus('error');
        setCourseError('Please log in to create a course.');
        return;
      }

      if (!courseDraft.title.trim()) {
        setCourseStatus('error');
        setCourseError('Course title is required.');
        return;
      }

      if (!courseDraft.slug.trim()) {
        setCourseStatus('error');
        setCourseError('Course slug is required.');
        return;
      }

      if (!courseDraft.description.trim()) {
        setCourseStatus('error');
        setCourseError('Course description is required.');
        return;
      }

      if (coverImageStatus === 'uploading') {
        setCourseStatus('error');
        setCourseError('Please wait for the cover image upload to finish.');
        return;
      }

      if (!coverImageId) {
        setCourseStatus('error');
        setCourseError(null);
        setCoverImageError('Cover image is required.');
        return;
      }

      if (validLessonDrafts.hasInvalidLesson) {
        setCourseStatus('error');
        setCourseError(null);
        setLessonError('Each lesson needs a title and lesson text. Add a valid YouTube embed URL if provided.');
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
        setLessonError('Add at least one lesson before saving.');
        return;
      }

      setCourseStatus('saving');
      setCourseError(null);
      setLessonError(null);
      setCourseNotice(null);

      try {
        const courseIdentifier = courseRecord?.id;
        const path = courseIdentifier
          ? `/api/content-creator-courses/${courseIdentifier}`
          : '/api/content-creator-courses';
        const attemptRequest = async (includeAuthor: boolean) =>
          strapiFetch<{ data?: CourseRecord }>(path, {
            method: courseIdentifier ? 'PUT' : 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              data: buildCoursePayload(includeAuthor),
            }),
          });

        let response: { data?: CourseRecord };
        try {
          response = await attemptRequest(false);
        } catch (error) {
          if (error instanceof StrapiRequestError && error.status === 400 && user?.id) {
            response = await attemptRequest(true);
          } else {
            throw error;
          }
        }

        const record = response?.data ?? response;
        setCourseRecord(record ?? null);
        setCourseStatus('success');
        setCourseNotice(courseIdentifier ? 'Draft updated.' : 'Draft saved.');
      } catch (error) {
        const message =
          error instanceof StrapiRequestError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unable to create course.';
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
      courseRecord,
      lessonDrafts,
      token,
      user?.id,
      validLessonDrafts,
    ],
  );

  const handleCoursePublish = useCallback(async () => {
    if (!token) {
      setCourseStatus('error');
      setCourseError('Please log in to publish a course.');
      return;
    }

    const courseIdentifier = courseRecord?.id;
    if (!courseIdentifier) {
      setCourseStatus('error');
      setCourseError('Save a draft before publishing.');
      return;
    }

    setCourseStatus('publishing');
    setCourseError(null);
    setCourseNotice(null);

    try {
      const response = await strapiFetch<{ data?: CourseRecord }>(
        `/api/content-creator-courses/${courseIdentifier}/publish`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const record = response?.data ?? response;
      setCourseRecord(record ?? courseRecord);
      setCourseStatus('success');
      setCourseNotice('Course published.');
    } catch (error) {
      const message =
        error instanceof StrapiRequestError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to publish course.';
      setCourseStatus('error');
      setCourseError(message);
    }
  }, [courseRecord, token]);

  const handleCoverImageChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      if (!token) {
        setCoverImageStatus('error');
        setCoverImageError('Please log in to upload a cover image.');
        return;
      }

      setCoverImageStatus('uploading');
      setCoverImageError(null);
      setCoverImageId(null);
      setCoverImageName(file.name);

      try {
        const base = getStrapiBaseUrl();
        if (!base) {
          throw new Error('Strapi base URL is not configured.');
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
          let message = `Upload failed with status ${response.status}`;
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
          throw new Error('Upload failed. Please try again.');
        }
        setCoverImageId(uploadedId);
        setCoverImageStatus('success');
        setCoverImageError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed. Please try again.';
        setCoverImageStatus('error');
        setCoverImageError(message);
      }
    },
    [token],
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
  }, []);

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
      courseStatus !== 'saving' &&
      courseStatus !== 'publishing'
    );
  }, [coverImageReady, coverImageStatus, courseStatus, requiredCourseFieldsValid, validLessonDrafts]);

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">Creator Studio</h1>
        <p className="text-sm text-neutral-600">Please log in.</p>
        <Link
          to="/membership?view=login"
          className="rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white"
        >
          Go to login
        </Link>
      </div>
    );
  }

  if (creatorStatus === 'loading') {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">Creator Studio</h1>
        <p className="text-sm text-neutral-600">Checking creator access…</p>
      </div>
    );
  }

  if (creatorStatus === 'error') {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">Creator Studio</h1>
        <p className="text-sm text-red-500">{creatorError ?? 'Unable to load your account.'}</p>
      </div>
    );
  }

  if (!isCreator) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">Creator Studio</h1>
        <p className="text-sm text-neutral-600">Access denied (not a content creator).</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white text-neutral-900 transition-colors dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-neutral-200 bg-neutral-50 p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand">Creator Studio</p>
          <h1 className="mt-4 text-3xl font-semibold">Create a Course</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Publish a course and add lessons under it.
          </p>
        </header>

        <form onSubmit={handleCourseSaveDraft} className="space-y-10">
          <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold">Step 1: Course details</h2>
                {courseRecord && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                      coursePublished
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-amber-500/10 text-amber-500'
                    }`}
                  >
                    {coursePublished ? 'Published' : 'Draft'}
                  </span>
                )}
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
                  Title
                </label>
                <input
                  id="course-title"
                  name="title"
                  value={courseDraft.title}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  placeholder="Course title"
                  required
                />
              </div>
              <div>
                <label htmlFor="course-slug" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  Slug
                </label>
                <input
                  id="course-slug"
                  name="slug"
                  value={courseDraft.slug}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  placeholder="course-title"
                  required
                />
                <p className="mt-2 text-xs text-neutral-500">Used in the course URL.</p>
              </div>
              <div>
                <label htmlFor="course-description" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  Description
                </label>
                <textarea
                  id="course-description"
                  name="description"
                  value={courseDraft.description}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  rows={4}
                  placeholder="Short summary"
                  required
                />
              </div>
              <div>
                <label htmlFor="course-cover-image" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  Cover image
                </label>
                <input
                  id="course-cover-image"
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm file:mr-4 file:rounded-full file:border-0 file:bg-brand/10 file:px-4 file:py-1 file:text-xs file:font-semibold file:uppercase file:tracking-[0.2em] file:text-brand focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  required
                />
                {coverImageStatus === 'uploading' && (
                  <p className="mt-2 text-xs text-neutral-500">Uploading…</p>
                )}
                {coverImageStatus === 'success' && coverImageId && (
                  <p className="mt-2 text-xs text-emerald-500">
                    Uploaded{coverImageName ? `: ${coverImageName}` : ''} (ID: {coverImageId})
                  </p>
                )}
                {coverImageError && <p className="mt-2 text-xs text-red-500">{coverImageError}</p>}
              </div>
              {courseError && <p className="text-sm text-red-500">{courseError}</p>}
              {courseRecord && (
                <p className="text-xs text-neutral-500">
                  Course ID: {courseRecord.id ?? 'N/A'}
                  {courseRecord.documentId ? ` · Document ID: ${courseRecord.documentId}` : ''}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {courseIdForLessons && validLessonCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleCoursePublish}
                    disabled={courseStatus === 'saving' || courseStatus === 'publishing'}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-500 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-500 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-emerald-500/40 disabled:text-emerald-500/40"
                  >
                    {courseStatus === 'publishing' ? 'Publishing…' : 'Publish'}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Step 2: Lessons</h2>
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Add lessons to the course.
            </p>
            <div className="mt-6 space-y-6">
              {lessonDrafts.map((lesson, index) => (
                <div
                  key={lesson.id}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      Lesson {index + 1}
                    </h3>
                    {lessonDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLessonDraft(lesson.id)}
                        className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      Lesson title
                    </label>
                    <input
                      value={lesson.lessonTitle}
                      onChange={(event) => handleLessonChange(lesson.id, 'lessonTitle', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      placeholder="Lesson title"
                      required
                    />
                  </div>
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                        YouTube embed URL
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setYoutubeInfoLessonId((prev) => (prev === lesson.id ? null : lesson.id))
                        }
                        className="text-xs font-semibold uppercase tracking-[0.2em] text-brand"
                      >
                        What&apos;s this?
                      </button>
                    </div>
                    <input
                      value={lesson.youtubeEmbedCode}
                      onChange={(event) => handleLessonChange(lesson.id, 'youtubeEmbedCode', event.target.value)}
                      onBlur={(event) => handleYoutubeBlur(lesson.id, event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      placeholder="https://www.youtube.com/embed/..."
                    />
                    {youtubeInfoLessonId === lesson.id && (
                      <div className="mt-2 rounded-2xl border border-neutral-200 bg-white p-3 text-xs text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                        The URL needed here is the embed URL link from the YouTube embed code — not the full script
                        itself, just the link. Do not enter the browser URL for the video — it won&apos;t work. To
                        get this link you need to first upload the video to YouTube (ideally as a private/unlisted
                        video) so the public cannot view it, but users from this website can. This keeps its
                        exclusivity to this platform.
                      </div>
                    )}
                    {lessonFieldErrors[lesson.id]?.youtubeEmbedCode && (
                      <p className="mt-2 text-xs text-red-500">{lessonFieldErrors[lesson.id]?.youtubeEmbedCode}</p>
                    )}
                  </div>
                  <div className="mt-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      Lesson text
                    </label>
                    <textarea
                      value={lessonTextToDisplay(lesson.lessonText)}
                      onChange={(event) => handleLessonChange(lesson.id, 'lessonText', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      rows={4}
                      placeholder="Lesson text"
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
                  Add lesson
                </button>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canSaveDraft}
              className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
            >
              {courseStatus === 'saving' ? 'Saving…' : 'Save draft'}
            </button>
            {!canSaveDraft && validLessonDrafts.validLessons.length === 0 && (
              <p className="text-xs text-neutral-500">Add at least one lesson to enable saving.</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
