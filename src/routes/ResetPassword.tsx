import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { StrapiNetworkError } from '../api/strapi-client';
import { resolveStrapiAuthError } from '../utils/strapiErrors';
import { useToast } from '../context/ToastContext';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const { reset } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setErrorMessage(t('auth.resetPassword.errors.mismatch'));
      return;
    }
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await reset(code, password, confirm);
      showToast(t('auth.resetPassword.success'), { tone: 'success' });
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof StrapiNetworkError) {
        setErrorMessage(t('auth.resetPassword.errors.network'));
      } else {
        const resolved = resolveStrapiAuthError(err);
        if (resolved.code === 'invalid_code') {
          setErrorMessage(t('auth.resetPassword.errors.invalidCode'));
        } else {
          setErrorMessage(resolved.message || t('auth.resetPassword.errors.generic'));
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!code) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-4 p-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--fg-default)]">
            {t('auth.resetPassword.title')}
          </h2>
          <p className="mt-3 text-sm text-[var(--fg-muted)]">
            {t('auth.resetPassword.errors.missingCode')}
          </p>
          <div className="mt-6">
            <Link
              to="/forgot-password"
              className="inline-flex w-full items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('auth.resetPassword.backToRequest')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center p-4">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--fg-default)]">{t('auth.resetPassword.title')}</h2>
        <p className="mt-3 text-sm text-[var(--fg-muted)]">{t('auth.resetPassword.subtitle')}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {errorMessage && <p className="text-sm font-medium text-[var(--error)]">{errorMessage}</p>}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--fg-default)]">
              {t('auth.resetPassword.passwordLabel')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={t('auth.resetPassword.passwordLabel')}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--fg-default)] shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[var(--fg-default)]">
              {t('auth.resetPassword.confirmPasswordLabel')}
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder={t('auth.resetPassword.confirmPasswordLabel')}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--fg-default)] shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
          >
            {submitting ? t('common.loading') : t('auth.resetPassword.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
