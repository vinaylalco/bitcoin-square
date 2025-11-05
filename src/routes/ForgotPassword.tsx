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
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">{t('auth.forgotPassword.title')}</h2>
      {sent ? (
        <p>{t('auth.forgotPassword.success')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {errorMessage && <p className="text-red-600 mb-2">{errorMessage}</p>}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder={t('common.emailPlaceholder')}
            className="w-full border p-2"
          />
          <button type="submit" className="w-full bg-brand text-white p-2">
            {t('common.sendResetLink')}
          </button>
        </form>
      )}
    </div>
  );
}
