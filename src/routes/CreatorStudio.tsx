import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { strapiFetch, StrapiRequestError } from '../api/strapi-client';
import { useAuth } from '../context/AuthContext';

const EMPTY_COURSE = {
  title: '',
  description: '',
  level: '',
  language: '',
  outline: '',
  youtube: '',
  videoUrl: '',
};

type CreatorMe = {
  contentCreator?: boolean;
};

type CourseRecord = {
  id?: number | string;
  documentId?: string;
  title?: string;
};

type LessonDraft = {
  id: string;
  title: string;
  order: string;
  content: string;
  duration: string;
  media: string;
};

const EMPTY_LESSON = (): LessonDraft => ({
  id: crypto.randomUUID?.() ?? `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  title: '',
  order: '',
  content: '',
  duration: '',
  media: '',
});

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function CreatorStudio() {
  const { token } = useAuth();
  const [creatorStatus, setCreatorStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorMe | null>(null);

  const [courseDraft, setCourseDraft] = useState({ ...EMPTY_COURSE });
  const [courseStatus, setCourseStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [courseError, setCourseError] = useState<string | null>(null);
  const [courseRecord, setCourseRecord] = useState<CourseRecord | null>(null);

  const [lessonDrafts, setLessonDrafts] = useState<LessonDraft[]>([EMPTY_LESSON()]);
  const [lessonStatus, setLessonStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
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
    return courseRecord.id ?? courseRecord.documentId ?? null;
  }, [courseRecord]);

  const handleCourseChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;
      setCourseDraft((prev) => ({ ...prev, [name]: value }));
      if (courseStatus !== 'idle') {
        setCourseStatus('idle');
      }
      if (courseError) {
        setCourseError(null);
      }
    },
    [courseError, courseStatus],
  );

  const handleCourseSubmit = useCallback(
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

      setCourseStatus('saving');
      setCourseError(null);

      try {
        const response = await strapiFetch<{ data?: CourseRecord }>('/api/courses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            data: {
              title: courseDraft.title.trim(),
              description: normalizeText(courseDraft.description),
              level: normalizeText(courseDraft.level),
              language: normalizeText(courseDraft.language),
              outline: normalizeText(courseDraft.outline),
              youtube: normalizeText(courseDraft.youtube),
              videoUrl: normalizeText(courseDraft.videoUrl),
            },
          }),
        });

        const record = response?.data ?? response;
        setCourseRecord(record ?? null);
        setCourseStatus('success');
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
    [courseDraft, token],
  );

  const handleLessonChange = useCallback(
    (id: string, field: keyof LessonDraft, value: string) => {
      setLessonDrafts((prev) =>
        prev.map((lesson) => (lesson.id === id ? { ...lesson, [field]: value } : lesson)),
      );
      if (lessonStatus !== 'idle') {
        setLessonStatus('idle');
      }
      if (lessonError) {
        setLessonError(null);
      }
    },
    [lessonError, lessonStatus],
  );

  const addLessonDraft = useCallback(() => {
    setLessonDrafts((prev) => [...prev, EMPTY_LESSON()]);
  }, []);

  const removeLessonDraft = useCallback((id: string) => {
    setLessonDrafts((prev) => prev.filter((lesson) => lesson.id !== id));
  }, []);

  const handleLessonSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!token) {
        setLessonStatus('error');
        setLessonError('Please log in to create lessons.');
        return;
      }

      if (!courseIdForLessons) {
        setLessonStatus('error');
        setLessonError('Create a course before adding lessons.');
        return;
      }

      const invalidLesson = lessonDrafts.find((lesson) => {
        if (!lesson.title.trim()) return true;
        if (!lesson.content.trim()) return true;
        const parsedOrder = Number(lesson.order);
        return Number.isNaN(parsedOrder) || !Number.isFinite(parsedOrder);
      });

      if (invalidLesson) {
        setLessonStatus('error');
        setLessonError('Each lesson needs a title, content, and numeric order.');
        return;
      }

      setLessonStatus('saving');
      setLessonError(null);

      try {
        await Promise.all(
          lessonDrafts.map((lesson) => {
            const order = Number(lesson.order);
            const duration = lesson.duration ? Number(lesson.duration) : null;
            return strapiFetch('/api/lessons', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                data: {
                  title: lesson.title.trim(),
                  order,
                  content: lesson.content.trim(),
                  duration: Number.isFinite(duration) ? duration : null,
                  media: normalizeText(lesson.media),
                  course: courseIdForLessons,
                },
              }),
            });
          }),
        );

        setLessonStatus('success');
      } catch (error) {
        const message =
          error instanceof StrapiRequestError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unable to create lessons.';
        setLessonStatus('error');
        setLessonError(message);
      }
    },
    [courseIdForLessons, lessonDrafts, token],
  );

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
            <h2 className="text-xl font-semibold">Step 1: Course details</h2>
            {courseStatus === 'success' && (
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
                Course created
              </span>
            )}
          </div>
          <form onSubmit={handleCourseSubmit} className="mt-6 space-y-4">
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
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="course-level" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  Level
                </label>
                <input
                  id="course-level"
                  name="level"
                  value={courseDraft.level}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  placeholder="Beginner, Intermediate, Advanced"
                />
              </div>
              <div>
                <label htmlFor="course-language" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  Language
                </label>
                <input
                  id="course-language"
                  name="language"
                  value={courseDraft.language}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  placeholder="EN, ES, etc."
                />
              </div>
            </div>
            <div>
              <label htmlFor="course-outline" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                Outline
              </label>
              <textarea
                id="course-outline"
                name="outline"
                value={courseDraft.outline}
                onChange={handleCourseChange}
                className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                rows={3}
                placeholder="Optional outline"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="course-youtube" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  YouTube
                </label>
                <input
                  id="course-youtube"
                  name="youtube"
                  value={courseDraft.youtube}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  placeholder="YouTube ID or URL"
                />
              </div>
              <div>
                <label htmlFor="course-video-url" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                  Video URL
                </label>
                <input
                  id="course-video-url"
                  name="videoUrl"
                  value={courseDraft.videoUrl}
                  onChange={handleCourseChange}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  placeholder="https://"
                />
              </div>
            </div>
            {courseError && <p className="text-sm text-red-500">{courseError}</p>}
            {courseRecord && (
              <p className="text-xs text-neutral-500">
                Course ID: {courseRecord.id ?? 'N/A'}
                {courseRecord.documentId ? ` · Document ID: ${courseRecord.documentId}` : ''}
              </p>
            )}
            <button
              type="submit"
              disabled={courseStatus === 'saving'}
              className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
            >
              {courseStatus === 'saving' ? 'Creating…' : 'Create course'}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Step 2: Lessons</h2>
            {lessonStatus === 'success' && (
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
                Lessons created
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Add lessons to the newly created course.
          </p>
          <form onSubmit={handleLessonSubmit} className="mt-6 space-y-6">
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
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={lesson.duration}
                      onChange={(event) => handleLessonChange(lesson.id, 'duration', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      placeholder="5"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
                      Media
                    </label>
                    <input
                      value={lesson.media}
                      onChange={(event) => handleLessonChange(lesson.id, 'media', event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      placeholder="Media URL"
                    />
                  </div>
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
              <button
                type="submit"
                disabled={lessonStatus === 'saving'}
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
              >
                {lessonStatus === 'saving' ? 'Saving…' : 'Create lessons'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
