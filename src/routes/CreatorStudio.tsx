import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { strapiFetch, StrapiRequestError } from '../api/strapi-client';
import { useAuth } from '../context/AuthContext';
const EMPTY_COURSE = {
  title: '',
  slug: '',
  description: '',
  coverImage: '',
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
  title: string;
  order: string;
  content: string;
};

const EMPTY_LESSON = (): LessonDraft => ({
  id: crypto.randomUUID?.() ?? `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  title: '',
  order: '',
  content: '',
});

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
  return !lesson.title.trim() && !lesson.content.trim() && !lesson.order.trim();
}

function parseLessonOrder(order: string): number | null {
  if (!order.trim()) return null;
  const parsed = Number(order);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export default function CreatorStudio() {
  const { token } = useAuth();
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
    const validLessons: Array<{ title: string; content: string; order: number }> = [];
    let hasInvalidLesson = false;

    lessonDrafts.forEach((lesson) => {
      if (isLessonBlank(lesson)) {
        return;
      }
      const parsedOrder = parseLessonOrder(lesson.order);
      if (!lesson.title.trim() || !lesson.content.trim() || parsedOrder === null) {
        hasInvalidLesson = true;
        return;
      }
      validLessons.push({
        title: lesson.title.trim(),
        content: lesson.content.trim(),
        order: parsedOrder,
      });
    });

    return { validLessons, hasInvalidLesson };
  }, [lessonDrafts]);

  const validLessonCount = validLessonDrafts.validLessons.length;

  const buildCoursePayload = useCallback(
    () => {
      const payload: {
        title: string;
        slug: string;
        description: string;
        lessons: Array<{ title: string; content: string; order: number }>;
        coverImage?: number;
      } = {
        title: courseDraft.title.trim(),
        slug: courseDraft.slug.trim(),
        description: courseDraft.description.trim(),
        lessons: validLessonDrafts.validLessons,
      };

      const coverImageValue = normalizeText(courseDraft.coverImage ?? '');
      if (coverImageValue) {
        const parsedCoverImage = Number(coverImageValue);
        if (!Number.isNaN(parsedCoverImage) && Number.isFinite(parsedCoverImage)) {
          payload.coverImage = parsedCoverImage;
        }
      }

      return payload;
    },
    [courseDraft, validLessonDrafts.validLessons],
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

      const coverImageValue = normalizeText(courseDraft.coverImage ?? '');
      if (coverImageValue) {
        const parsedCoverImage = Number(coverImageValue);
        if (Number.isNaN(parsedCoverImage) || !Number.isFinite(parsedCoverImage)) {
          setCourseStatus('error');
          setCourseError('Cover image must be a numeric media ID.');
          return;
        }
      }

      if (validLessonDrafts.hasInvalidLesson) {
        setCourseStatus('error');
        setCourseError(null);
        setLessonError('Each lesson needs a title, content, and numeric order.');
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
        const response = await strapiFetch<{ data?: CourseRecord }>(path, {
          method: courseIdentifier ? 'PUT' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            data: buildCoursePayload(),
          }),
        });

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
    [buildCoursePayload, courseDraft.description, courseDraft.slug, courseDraft.title, courseRecord, token, validLessonDrafts],
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

  const handleLessonChange = useCallback(
    (id: string, field: keyof LessonDraft, value: string) => {
      setLessonDrafts((prev) =>
        prev.map((lesson) => (lesson.id === id ? { ...lesson, [field]: value } : lesson)),
      );
      if (lessonError) {
        setLessonError(null);
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
          <form onSubmit={handleCourseSaveDraft} className="mt-6 space-y-4">
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
                Cover image (media ID)
              </label>
              <input
                id="course-cover-image"
                name="coverImage"
                value={courseDraft.coverImage}
                onChange={handleCourseChange}
                className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                placeholder="Optional media ID"
              />
            </div>
            {courseError && <p className="text-sm text-red-500">{courseError}</p>}
            {courseRecord && (
              <p className="text-xs text-neutral-500">
                Course ID: {courseRecord.id ?? 'N/A'}
                {courseRecord.documentId ? ` · Document ID: ${courseRecord.documentId}` : ''}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={courseStatus === 'saving' || courseStatus === 'publishing'}
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
              >
                {courseStatus === 'saving' ? 'Saving…' : 'Save draft'}
              </button>
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
          </form>
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
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      Title
                    </label>
                    <input
                      value={lesson.title}
                      onChange={(event) => handleLessonChange(lesson.id, 'title', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      placeholder="Lesson title"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      Order
                    </label>
                    <input
                      type="number"
                      value={lesson.order}
                      onChange={(event) => handleLessonChange(lesson.id, 'order', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      placeholder="1"
                      min={0}
                      required
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                    Content
                  </label>
                  <textarea
                    value={lesson.content}
                    onChange={(event) => handleLessonChange(lesson.id, 'content', event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    rows={4}
                    placeholder="Lesson content"
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
      </div>
    </div>
  );
}
