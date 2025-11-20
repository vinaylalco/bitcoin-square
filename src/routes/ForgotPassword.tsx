import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { forgotPassword } from '../api/auth';
import { StrapiNetworkError } from '../api/strapi-client';
import { resolveStrapiAuthError } from '../utils/strapiErrors';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { t } = useTranslation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      if (err instanceof StrapiNetworkError) {
        setErrorMessage(t('auth.forgotPassword.errors.network'));
      } else {
        const resolved = resolveStrapiAuthError(err);
        if (resolved.code === 'invalid_code') {
          setErrorMessage(t('auth.forgotPassword.errors.invalidCode'));
        } else {
          setErrorMessage(resolved.message || t('auth.forgotPassword.errors.generic'));
        }
      }
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center p-4">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--fg-default)]">
          {t('auth.forgotPassword.title')}
        </h2>
        <p className="mt-3 text-sm text-[var(--fg-muted)]">{t('auth.forgotPassword.subtitle')}</p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--fg-default)]">
            {t('auth.forgotPassword.sentMessage')}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {errorMessage && <p className="text-sm font-medium text-[var(--error)]">{errorMessage}</p>}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[var(--fg-default)]" htmlFor="forgot-email">
                {t('auth.forgotPassword.emailLabel')}
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={t('common.emailPlaceholder')}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--fg-default)] shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('auth.forgotPassword.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
