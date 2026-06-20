import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { supabase } from '../lib/supabaseClient';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const SECRET_HELPER_MESSAGE =
  'Your secret is used later to encrypt your journal on this device. It is not stored by us. If you forget it, encrypted journal entries may not be recoverable.';

function normalizeInput(value: string): string {
  return value.trim();
}

export default function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = normalizeInput(email);
    const currentPassword = password;
    const currentConfirmPassword = confirmPassword;
    const currentSecret = secret;
    const currentConfirmSecret = confirmSecret;

    if (!emailRegex.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (currentPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (currentPassword !== currentConfirmPassword) {
      setError('Password and confirm password must match.');
      return;
    }

    if (!currentSecret) {
      setError('Enter a journal secret.');
      return;
    }

    if (currentSecret !== currentConfirmSecret) {
      setError('Secret and confirm secret must match.');
      return;
    }

    setLoading(true);
    setSecret('');
    setConfirmSecret('');

    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: currentPassword,
      });
      setPassword('');
      setConfirmPassword('');

      if (signupError) {
        setError(signupError.message);
        return;
      }

      if (data.session) {
        navigate('/login', {
          replace: true,
          state: { message: 'Account created. You can now log in.' },
        });
        return;
      }

      setSuccess('Check your email to confirm your account, then log in.');
    } catch {
      setError('Unable to create your account. Please try again.');
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
            Create account
          </h1>
          <p className="text-sm font-medium leading-relaxed text-[var(--fg-muted)]">
            Sign up with your email and password. Keep your journal secret private.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <label htmlFor="signup-email" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={loading}
              className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="signup-password" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                disabled={loading}
                className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-confirm-password" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                Confirm password
              </label>
              <input
                id="signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                disabled={loading}
                className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="signup-secret" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                Secret
              </label>
              <input
                id="signup-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="off"
                disabled={loading}
                className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="signup-confirm-secret" className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--fg-muted)]">
                Confirm secret
              </label>
              <input
                id="signup-confirm-secret"
                type="password"
                value={confirmSecret}
                onChange={(event) => setConfirmSecret(event.target.value)}
                autoComplete="off"
                disabled={loading}
                className="w-full rounded-2xl border border-brand/20 bg-transparent px-4 py-3 text-sm text-[var(--fg-default)] shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
              />
            </div>
          </div>

          <p className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-xs font-semibold leading-relaxed text-[var(--fg-muted)]">
            {SECRET_HELPER_MESSAGE}
          </p>

          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
          {success && (
            <p className="text-sm font-semibold text-brand">
              {success}{' '}
              <Link to="/login" className="underline">
                Go to login.
              </Link>
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-brand via-brand/90 to-[#FFF582] px-6 py-3 text-sm font-semibold uppercase tracking-[0.32em] text-white shadow-[0_20px_45px_rgba(169,21,255,0.35)] transition hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(169,21,255,0.45)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </section>
    </div>
  );
}
