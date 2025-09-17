import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Copy,
  Eye,
  EyeOff,
  Flame,
  Layers,
  LogOut,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout, nostrPrivKey } = useAuth();
  const nav = useNavigate();
  const [showPriv, setShowPriv] = useState(false);

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

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-20%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-sky-500/60 via-indigo-500/40 to-fuchsia-500/40 blur-3xl" />
        <div className="absolute right-[-18%] bottom-[-20%] h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-cyan-400/40 via-blue-500/30 to-purple-500/30 blur-3xl" />
        <div className="absolute left-[-12%] bottom-[-10%] h-[20rem] w-[20rem] rounded-full bg-gradient-to-br from-emerald-400/30 via-teal-500/20 to-cyan-500/20 blur-3xl" />
      </div>
      <div className="relative z-10 px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12">
          <header className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_40px_120px_-40px_rgba(13,148,136,0.6)] backdrop-blur-xl sm:p-12">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <span className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200/70">
                  <Sparkles className="h-5 w-5 text-sky-300" />
                  Welcome back
                </span>
                <h2 className="mt-6 text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
                  Ready for your next breakthrough, {user.username || user.email}?
                </h2>
                <p className="mt-4 max-w-2xl text-base text-slate-300/90">
                  Keep stacking knowledge, unlocking modules, and building a streak that sticks. Your
                  progress lives here.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold uppercase tracking-widest text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/20 hover:shadow-[0_20px_50px_-20px_rgba(56,189,248,0.65)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <article className="flex flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-br from-white/15 via-white/5 to-transparent p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                <div className="flex items-center justify-between text-slate-200">
                  <span className="text-xs uppercase tracking-[0.25em] text-slate-300/80">Points</span>
                  <Trophy className="h-6 w-6 text-amber-300" />
                </div>
                <p className="mt-6 text-4xl font-semibold text-white">{formattedPoints}</p>
                <p className="mt-2 text-sm text-slate-300/80">Cumulative sats-ready points earned</p>
              </article>

              <article className="flex flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/20 via-indigo-500/10 to-transparent p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="flex items-center justify-between text-slate-200">
                  <span className="text-xs uppercase tracking-[0.25em] text-slate-300/80">Study streak</span>
                  <Flame className="h-6 w-6 text-orange-300" />
                </div>
                <p className="mt-6 text-4xl font-semibold text-white">{normalizedStreak}</p>
                <p className="mt-2 text-sm text-slate-300/80">Consecutive days showing up to learn</p>
              </article>

              <article className="flex flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-400/20 via-teal-500/10 to-transparent p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="flex items-center justify-between text-slate-200">
                  <span className="text-xs uppercase tracking-[0.25em] text-slate-300/80">Lessons</span>
                  <Layers className="h-6 w-6 text-emerald-200" />
                </div>
                <p className="mt-6 text-4xl font-semibold text-white">{lessonsCompleted}</p>
                <p className="mt-2 text-sm text-slate-300/80">Total lessons conquered across all topics</p>
              </article>
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-50px_rgba(14,165,233,0.6)] backdrop-blur-xl">
              <h3 className="text-xl font-semibold text-white">Account overview</h3>
              <dl className="mt-6 space-y-5 text-sm text-slate-200">
                <div className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <dt className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Email</dt>
                  <dd className="text-base font-medium text-white break-words">{user.email}</dd>
                </div>
                {user.username && (
                  <div className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <dt className="text-xs uppercase tracking-[0.3em] text-slate-300/70">Username</dt>
                    <dd className="text-base font-medium text-white break-words">{user.username}</dd>
                  </div>
                )}
                <div className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <dt className="text-xs uppercase tracking-[0.3em] text-slate-300/70">User ID</dt>
                  <dd className="text-base font-medium text-white break-words">{user.id}</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-50px_rgba(59,130,246,0.6)] backdrop-blur-xl">
              <h3 className="text-xl font-semibold text-white">Nostr credentials</h3>
              <p className="text-sm text-slate-300/80">
                Securely manage your keys. Copy them when you need to plug into your favourite Nostr
                client.
              </p>
              {user.nostrPublicKey ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
                      Public key
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(user.nostrPublicKey || '')}
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </div>
                  <p className="mt-3 break-all text-sm text-slate-100/90">{user.nostrPublicKey}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-slate-300/70">
                  Connect your Nostr keys in Settings to sync across the ecosystem.
                </div>
              )}

              {nostrPrivKey && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-300/70">
                      Private key
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPriv((s) => !s)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                      >
                        {showPriv ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {showPriv ? 'Hide' : 'Show'}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(nostrPrivKey)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 break-all text-sm text-slate-100/90">
                    {showPriv ? nostrPrivKey : '•••• •••• •••• •••• •••• •••• •••• ••••'}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
