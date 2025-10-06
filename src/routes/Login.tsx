import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { clearPendingCheckout, getPendingCheckout } from '../utils/pendingCheckout';

interface LocationState {
  redirectTo?: string;
  checkoutUrl?: string;
  intent?: string;
}

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const { t } = useTranslation();
  const state = (location.state as LocationState) || {};
  const redirectTarget = state.redirectTo || '/dashboard';
  const pendingCheckoutUrl = useMemo(() => state.checkoutUrl || getPendingCheckout(), [state.checkoutUrl]);
  const cameFromCheckout = state.intent === 'checkout' || Boolean(pendingCheckoutUrl);

  useEffect(() => {
    if (!user || !pendingCheckoutUrl) return;
    clearPendingCheckout();
    window.location.href = pendingCheckoutUrl;
  }, [user, pendingCheckoutUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey('');
    try {
      await login(email, password);
      if (pendingCheckoutUrl) {
        clearPendingCheckout();
        window.location.href = pendingCheckoutUrl;
        return;
      }
      nav(redirectTarget, { replace: true });
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.toLowerCase().includes('bad request')) {
        setErrorKey('auth.login.errors.invalid');
      } else {
        setErrorKey('auth.login.errors.generic');
      }
    }
  }

  if (user && !pendingCheckoutUrl) return <Navigate to={redirectTarget} replace />;

  return (
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">{t('auth.login.title')}</h2>
      {cameFromCheckout && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm text-[var(--fg-muted)]">
          Log in to continue to checkout so we can link your purchase to your account.
        </div>
      )}
      {errorKey && <p className="text-red-600 mb-2">{t(errorKey)}</p>}
      <form onSubmit={submit} className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder={t('common.emailPlaceholder')}
          className="w-full border p-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder={t('common.passwordPlaceholder')}
          className="w-full border p-2"
        />
        <button type="submit" className="w-full bg-brand text-white p-2">{t('auth.login.submit')}</button>
      </form>
      <div className="mt-4 text-sm">
        <Link to="/register" className="text-brand">{t('auth.login.linkRegister')}</Link>
        {/* {' | '}
        <Link to="/forgot-password" className="text-brand">Forgot password?</Link> */}
      </div>
    </div>
  );
}
