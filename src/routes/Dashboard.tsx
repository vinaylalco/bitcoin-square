import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Copy, Flame, Layers, LogOut, MessageCircle, Sparkles, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { updateProfileSettings } from '../api/account';
import { uploadProfileAvatar } from '../api/media';
import { validateImageFile } from '../utils/imageUpload';
import { generateScreenName, normalizeAvatarUrl, normalizeScreenName } from '../utils/profileDefaults';
import { COMMUNITY_MESSAGES_PATH } from '../utils/routes';

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, logout, nostrPrivKey, token, updateUser } = useAuth();
  const nav = useNavigate();

  const profileSeed = useMemo(
    () => user?.nostrPublicKey ?? user?.email ?? String(user?.id ?? ''),
    [user?.email, user?.id, user?.nostrPublicKey],
  );
  const defaultScreenName = useMemo(() => generateScreenName(profileSeed), [profileSeed]);
  const defaultAvatar = useMemo(() => normalizeAvatarUrl(user?.avatarUrl, profileSeed), [profileSeed, user?.avatarUrl]);

  const [screenName, setScreenName] = useState(() => user?.screenName ?? defaultScreenName);
  const [avatarUrl, setAvatarUrl] = useState(() => defaultAvatar);
  const [profileStatus, setProfileStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarUploadStatus, setAvatarUploadStatus] = useState<'idle' | 'uploading' | 'error' | 'success'>('idle');
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setScreenName(user?.screenName ?? defaultScreenName);
  }, [defaultScreenName, user?.screenName]);

  useEffect(() => {
    setAvatarUrl(normalizeAvatarUrl(user?.avatarUrl, profileSeed));
  }, [profileSeed, user?.avatarUrl]);

  if (!user) return <Navigate to="/membership?view=login" replace />;

  const referralLink = `https://bitcoinsquare.io/?ref=${user.id}`;

  const formattedPoints = useMemo(() => (user.points ?? 0).toLocaleString(), [user.points]);
  const normalizedStreak = useMemo(
    () => Math.max(0, Math.floor(user.studyStreak ?? 0)),
    [user.studyStreak],
  );
  const lessonsCompleted = useMemo(() => {
    return Object.values(user.lessonCompletions ?? {}).reduce(
      (total, entries) => total + entries.length,
      0,
    );
  }, [user.lessonCompletions]);

  const heroTitle = t('dashboard.hero.title', {
    name: user.screenName || user.username || user.email,
  });
  const heroSubtitle = t('dashboard.hero.subtitle');

  function handleLogout() {
    logout();
    nav('/');
  }

  const handleAvatarFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!user || !token) {
        const message = t('dashboard.account.errors.authRequired');
        setAvatarUploadStatus('error');
        setAvatarUploadError(message);
        event.target.value = '';
        return;
      }

      const validationMessage = validateImageFile(file);
      if (validationMessage) {
        setAvatarUploadStatus('error');
        setAvatarUploadError(validationMessage);
        event.target.value = '';
        return;
      }

      const previousAvatarUrl = avatarUrl;

      setAvatarUploadStatus('uploading');
      setAvatarUploadError(null);
      setProfileStatus('saving');
      setProfileError(null);

      try {
        const { url: uploadedUrl } = await uploadProfileAvatar(file);
        const normalizedUrl = normalizeAvatarUrl(uploadedUrl, profileSeed);
        setAvatarUrl(normalizedUrl);

        const response = await updateProfileSettings(user.id, token, {
          avatarUrl: normalizedUrl,
        });

        const nextAvatar = normalizeAvatarUrl(response.avatarUrl ?? normalizedUrl, profileSeed);

        setAvatarUrl(nextAvatar);
        updateUser((prev) => (prev ? { ...prev, avatarUrl: nextAvatar } : prev));

        setAvatarUploadStatus('success');
        setAvatarUploadError(null);
        setProfileStatus('success');
        setProfileError(null);
      } catch (error) {
        console.error('Profile photo upload failed', error);
        const message =
          error instanceof Error ? error.message : t('dashboard.account.errors.upload');
        setAvatarUploadStatus('error');
        setAvatarUploadError(message);
        setProfileStatus('error');
        setProfileError(message);
        setAvatarUrl(previousAvatarUrl);
      } finally {
        event.target.value = '';
      }
    },
    [avatarUrl, profileSeed, token, updateUser, user],
  );

  const handleProfileSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!user || !token) return;

      const trimmedName = normalizeScreenName(screenName, profileSeed);
      const trimmedAvatar = normalizeAvatarUrl(avatarUrl, profileSeed);

      setProfileStatus('saving');
      setProfileError(null);

      try {
        const response = await updateProfileSettings(user.id, token, {
          screenName: trimmedName,
          avatarUrl: trimmedAvatar,
        });
        const nextName = response.screenName ?? trimmedName;
        const nextAvatar = response.avatarUrl ?? trimmedAvatar;
        updateUser((prev) =>
          prev
            ? {
                ...prev,
                screenName: nextName,
                avatarUrl: nextAvatar,
              }
            : prev,
        );
        setScreenName(nextName);
        setAvatarUrl(nextAvatar);
        setProfileStatus('success');
      } catch (error) {
        setProfileStatus('error');
        setProfileError(
          error instanceof Error ? error.message : t('dashboard.account.errors.profile'),
        );
      }
    },
    [avatarUrl, profileSeed, screenName, token, updateUser, user],
  );

  const handleRandomizeName = useCallback(() => {
    const next = generateScreenName(`${profileSeed}:${Date.now()}`);
    setScreenName(next);
    setProfileStatus('idle');
  }, [profileSeed]);

  const openAvatarPicker = useCallback(() => {
    avatarInputRef.current?.click();
  }, []);

  const showAvatarAdvancedOptions = false;

  const isProfileSaving = profileStatus === 'saving';

  const handleScreenNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setScreenName(event.target.value);
      if (profileStatus === 'success') {
        setProfileStatus('idle');
      }
    },
    [profileStatus],
  );

  const handleAvatarUrlInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setAvatarUrl(event.target.value);
      setProfileStatus('idle');
      if (avatarUploadStatus !== 'idle') {
        setAvatarUploadStatus('idle');
        setAvatarUploadError(null);
      }
    },
    [avatarUploadStatus],
  );

  return (
    <div className="min-h-screen w-full bg-white text-neutral-900 transition-colors dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-neutral-200 bg-neutral-50 p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900 sm:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand dark:bg-brand/20">
                <Sparkles className="h-4 w-4" />
                {t('dashboard.hero.badge')}
              </span>
              <h2 className="mt-6 text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
                {heroTitle}
              </h2>
              <p className="mt-4 max-w-2xl text-base text-neutral-600 dark:text-neutral-300">
                {heroSubtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 self-start rounded-full bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <LogOut className="h-4 w-4" />
              {t('dashboard.hero.logout')}
            </button>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                {t('dashboard.stats.points.label')}
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
                  <Trophy className="h-5 w-5" />
                </span>
              </div>
              <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">{formattedPoints}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.stats.points.helper')}</p>
            </article>

            <article className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                {t('dashboard.stats.streak.label')}
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
                  <Flame className="h-5 w-5" />
                </span>
              </div>
              <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">{normalizedStreak}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.stats.streak.helper')}</p>
            </article>

            <article className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                {t('dashboard.stats.lessons.label')}
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
                  <Layers className="h-5 w-5" />
                </span>
              </div>
              <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">{lessonsCompleted}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.stats.lessons.helper')}</p>
            </article>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-xl font-semibold">{t('dashboard.account.title')}</h3>
            <dl className="mt-6 space-y-5 text-sm text-neutral-600 dark:text-neutral-300">
              <div className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">{t('dashboard.account.email')}</dt>
                <dd className="break-words text-base font-medium text-neutral-900 dark:text-neutral-100">{user.email}</dd>
              </div>
              {user.username && (
                <div className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                  <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">{t('dashboard.account.username')}</dt>
                  <dd className="break-words text-base font-medium text-neutral-900 dark:text-neutral-100">{user.username}</dd>
                </div>
              )}
              <div className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">{t('dashboard.account.userId')}</dt>
                <dd className="break-words text-base font-medium text-neutral-900 dark:text-neutral-100">{user.id}</dd>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Your Referral Code</dt>
                <dd className="break-words text-base font-medium text-neutral-900 dark:text-neutral-100">{user.id}</dd>
                <dd className="break-words text-sm font-medium text-neutral-700 dark:text-neutral-200">{referralLink}</dd>
              </div>
            </dl>

            <form
              onSubmit={handleProfileSubmit}
              className="mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-3xl border border-neutral-200 bg-gradient-to-br from-amber-200 via-orange-200 to-pink-200 shadow-inner dark:border-neutral-700 dark:from-orange-500/40 dark:via-amber-500/30 dark:to-pink-500/30">
                  <img
                    src={avatarUrl}
                    alt="Profile preview"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={openAvatarPicker}
                    className="absolute inset-x-2 bottom-2 rounded-full bg-neutral-900/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-md transition hover:bg-neutral-900/90"
                  >
                    {t('dashboard.account.changePhoto')}
                  </button>
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="screen-name" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                      {t('dashboard.account.screenName')}
                    </label>
                    {profileStatus === 'success' && (
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
                        {t('dashboard.common.saved')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">
                    {t('dashboard.account.screenNameHelper')}
                  </p>
                  <input
                    id="screen-name"
                    value={screenName}
                    onChange={handleScreenNameChange}
                    className="w-full rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 transition focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    placeholder={t('dashboard.account.screenNamePlaceholder')}
                    maxLength={40}
                    autoComplete="off"
                  />
                  {showAvatarAdvancedOptions && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRandomizeName}
                        className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600 transition hover:border-brand hover:text-brand dark:border-neutral-700 dark:text-neutral-200"
                      >
                        {t('dashboard.account.randomize')}
                      </button>
                      <button
                        type="button"
                        onClick={openAvatarPicker}
                        className="rounded-full border border-brand/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand transition hover:border-brand"
                      >
                        {t('dashboard.account.uploadPhoto')}
                      </button>
                    </div>
                  )}
                  {showAvatarAdvancedOptions && (
                    <div className="space-y-2">
                      <label htmlFor="avatar-url" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                        Avatar image URL
                      </label>
                      <input
                        id="avatar-url"
                        value={avatarUrl}
                        onChange={handleAvatarUrlInput}
                        className="w-full rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 transition focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                        placeholder="https://"
                        autoComplete="off"
                      />
                    </div>
                  )}
                </div>
              </div>
              {(avatarUploadStatus === 'uploading' || avatarUploadStatus === 'success' || avatarUploadStatus === 'error') && (
                <div className="mt-2 space-y-1">
                  {avatarUploadStatus === 'uploading' && (
                    <p className="text-xs text-neutral-500">{t('dashboard.account.avatarUploading')}</p>
                  )}
                  {avatarUploadStatus === 'success' && (
                    <p className="text-xs text-emerald-500">{t('dashboard.account.avatarUpdated')}</p>
                  )}
                  {avatarUploadStatus === 'error' && avatarUploadError && (
                    <p className="text-xs text-red-500">{avatarUploadError}</p>
                  )}
                </div>
              )}
              {profileError && <p className="text-xs text-red-500">{profileError}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t('dashboard.account.avatarTip')}
                </span>
                <button
                  type="submit"
                  disabled={isProfileSaving || avatarUploadStatus === 'uploading' || !token}
                  className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
                >
                  {isProfileSaving ? t('dashboard.common.saving') : t('dashboard.account.saveProfile')}
                </button>
              </div>
            </form>

          <div className="flex flex-col gap-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">{t('dashboard.messages.title')}</h3>
              <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                {t('dashboard.messages.badge')}
              </span>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {t('dashboard.messages.description')}
            </p>
            {user.nostrPublicKey ? (
              <Link
                to={COMMUNITY_MESSAGES_PATH}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90"
              >
                <MessageCircle className="h-4 w-4" />
                {t('dashboard.messages.cta')}
              </Link>
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600 transition-colors dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-300">
                {t('dashboard.messages.connectPrompt')}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-xl font-semibold">{t('dashboard.nostr.title')}</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {t('dashboard.nostr.description')}
            </p>
            {user.nostrPublicKey ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">{t('dashboard.nostr.public')}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(user.nostrPublicKey || '')}
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t('dashboard.common.copy')}
                  </button>
                </div>
                <p className="mt-3 break-all text-sm font-mono text-neutral-900 dark:text-neutral-100">{user.nostrPublicKey}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600 transition-colors dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-300">
                {t('dashboard.nostr.connectPrompt')}
              </div>
            )}

            {nostrPrivKey && (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">{t('dashboard.nostr.private')}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(nostrPrivKey)}
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t('dashboard.common.copy')}
                  </button>
                </div>
                <p
                  aria-hidden="true"
                  className="mt-3 break-all font-mono text-sm text-neutral-900 blur-sm select-none dark:text-neutral-100"
                >
                  {nostrPrivKey}
                </p>
                <span className="sr-only">
                  {t('dashboard.nostr.privateSrOnly')}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
