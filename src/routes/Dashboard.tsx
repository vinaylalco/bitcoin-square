import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Copy, Flame, Layers, LogOut, Sparkles, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { updateLightningAddress } from '../api/account';

export default function Dashboard() {
  const { user, logout, nostrPrivKey, token, updateUser } = useAuth();
  const nav = useNavigate();

  const [lightningAddress, setLightningAddress] = useState(() => user?.lnWalletAddress ?? '');
  const [lightningStatus, setLightningStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [lightningError, setLightningError] = useState<string | null>(null);

  useEffect(() => {
    setLightningAddress(user?.lnWalletAddress ?? '');
  }, [user?.lnWalletAddress]);

  if (!user) return <Navigate to="/login" replace />;

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

  function handleLogout() {
    logout();
    nav('/');
  }

  const handleLightningSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!user || !token) return;

      const trimmed = lightningAddress.trim();
      setLightningStatus('saving');
      setLightningError(null);

      try {
        const response = await updateLightningAddress(
          user.id,
          token,
          trimmed.length > 0 ? trimmed : null,
        );
        const nextValue = response.lnWalletAddress ?? response.lightningAddress ?? (trimmed.length > 0 ? trimmed : null);
        updateUser((prev) => (prev ? { ...prev, lnWalletAddress: nextValue ?? null } : prev));
        setLightningStatus('success');
        setLightningAddress(nextValue ?? '');
      } catch (error) {
        setLightningStatus('error');
        setLightningError(
          error instanceof Error ? error.message : 'Unable to update your Lightning address right now.',
        );
      }
    },
    [lightningAddress, token, updateUser, user],
  );

  const isLightningSaving = lightningStatus === 'saving';

  return (
    <div className="min-h-screen w-full bg-white text-neutral-900 transition-colors dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-neutral-200 bg-neutral-50 p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900 sm:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand dark:bg-brand/20">
                <Sparkles className="h-4 w-4" />
                Welcome back
              </span>
              <h2 className="mt-6 text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
                Ready for your next breakthrough, {user.username || user.email}?
              </h2>
              <p className="mt-4 max-w-2xl text-base text-neutral-600 dark:text-neutral-300">
                Keep stacking knowledge, unlocking modules, and building a streak that sticks. Your progress lives here.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 self-start rounded-full bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                Points
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
                  <Trophy className="h-5 w-5" />
                </span>
              </div>
              <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">{formattedPoints}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">Cumulative sats-ready points earned</p>
            </article>

            <article className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                Study streak
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
                  <Flame className="h-5 w-5" />
                </span>
              </div>
              <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">{normalizedStreak}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">Consecutive days showing up to learn</p>
            </article>

            <article className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                Lessons
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
                  <Layers className="h-5 w-5" />
                </span>
              </div>
              <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">{lessonsCompleted}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">Total lessons conquered across all topics</p>
            </article>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-xl font-semibold">Account overview</h3>
            <dl className="mt-6 space-y-5 text-sm text-neutral-600 dark:text-neutral-300">
              <div className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Email</dt>
                <dd className="break-words text-base font-medium text-neutral-900 dark:text-neutral-100">{user.email}</dd>
              </div>
              {user.username && (
                <div className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                  <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Username</dt>
                  <dd className="break-words text-base font-medium text-neutral-900 dark:text-neutral-100">{user.username}</dd>
                </div>
              )}
              <div className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">User ID</dt>
                <dd className="break-words text-base font-medium text-neutral-900 dark:text-neutral-100">{user.id}</dd>
              </div>
            </dl>

            <form onSubmit={handleLightningSubmit} className="mt-6 space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="lightning-address" className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">
                  Lightning wallet address
                </label>
                {lightningStatus === 'success' && (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">
                    Saved
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Add a Lightning address (for example, <code className="font-mono">name@provider.com</code>) so other members can send you sats directly from the community areas.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="lightning-address"
                  name="lightning-address"
                  value={lightningAddress}
                  onChange={(event) => {
                    setLightningAddress(event.target.value);
                    if (lightningStatus === 'success') {
                      setLightningStatus('idle');
                    }
                  }}
                  placeholder="you@lightningaddress.com"
                  className="w-full flex-1 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900 transition focus:border-brand focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={isLightningSaving || !token}
                  className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-brand/40"
                >
                  {isLightningSaving ? 'Saving…' : 'Save address'}
                </button>
              </div>
              {lightningError && (
                <p className="text-xs text-red-500">{lightningError}</p>
              )}
            </form>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition-colors dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-xl font-semibold">Nostr credentials</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Securely manage your keys. Copy them when you need to plug into your favourite Nostr client.
            </p>
            {user.nostrPublicKey ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Public key</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(user.nostrPublicKey || '')}
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
                <p className="mt-3 break-all text-sm font-mono text-neutral-900 dark:text-neutral-100">{user.nostrPublicKey}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600 transition-colors dark:border-neutral-700 dark:bg-neutral-950/40 dark:text-neutral-300">
                Connect your Nostr keys in Settings to sync across the ecosystem.
              </div>
            )}

            {nostrPrivKey && (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors dark:border-neutral-800 dark:bg-neutral-950/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400">Private key</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(nostrPrivKey)}
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
                <p
                  aria-hidden="true"
                  className="mt-3 break-all font-mono text-sm text-neutral-900 blur-sm select-none dark:text-neutral-100"
                >
                  {nostrPrivKey}
                </p>
                <span className="sr-only">
                  Private key hidden for security. Use the copy button to copy it when needed.
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
