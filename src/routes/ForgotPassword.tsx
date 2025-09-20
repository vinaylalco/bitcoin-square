import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { forgotPassword } from '../api/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const { t } = useTranslation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey('');
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setErrorKey('auth.forgotPassword.errors.generic');
    }
  }

  return (
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">{t('auth.forgotPassword.title')}</h2>
      {sent ? (
        <p>{t('auth.forgotPassword.success')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {errorKey && <p className="text-red-600 mb-2">{t(errorKey)}</p>}
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
