import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useJournalSession } from '../hooks/useJournalSession';
import { supabase } from '../lib/supabaseClient';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeInput(value: string): string {
  return value.trim();
}

export default function Login() {
  const navigate = useNavigate();
  const { setDecryptedJournalEntries, setJournalSecret, setSession } = useJournalSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = normalizeInput(email);
    const currentPassword = password;
    const currentSecret = secret;

    if (!emailRegex.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (!currentPassword) {
      setError('Enter your password.');
      return;
    }

    if (!currentSecret) {
      setError('Enter your journal secret.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: currentPassword,
      });
      setPassword('');

      if (loginError) {
        setError(loginError.message);
        return;
      }

      if (!data.session) {
        setError('Unable to start a Supabase session. Please try again.');
        return;
      }

      setSession(data.session);
      setJournalSecret(currentSecret);
      setDecryptedJournalEntries([]);
      setSecret('');
      navigate('/', { replace: true });
    } catch {
      setError('Unable to log in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-4 py-16 sm:px-6">
      <section className="w-full rounded-3xl border border-brand/20 bg-[var(--bg-card)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.42em] text-brand">
            Distinctive Journaling
          </p>
          <h1 className="text-3xl font-black uppercase tracking-[0.16em] text-[var(--fg-default)]">
            Log in
          </h1>
          <p className="text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
            Use your account password to log in and your journal secret to unlock encrypted entries on this device.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={loading}
              className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="login-password" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={loading}
              className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="login-secret" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              Secret
            </label>
            <input
              id="login-secret"
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              autoComplete="off"
              disabled={loading}
              className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
            />
            <p className="text-xs font-semibold leading-relaxed text-[var(--fg-muted)]">
              Your secret stays in memory for this browser session only. Refreshing the page clears it.
            </p>
          </div>

          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(169,21,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs font-semibold uppercase tracking-[0.28em] text-[var(--fg-muted)]">
          Need an account?{' '}
          <Link to="/signup" className="text-brand hover:underline">
            Sign up
          </Link>
        </p>
      </section>
    </div>
  );
}
