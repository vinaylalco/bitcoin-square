import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const { reset } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const { t } = useTranslation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setErrorKey('auth.resetPassword.errors.mismatch');
      return;
    }
    setErrorKey('');
    try {
      await reset(code, password, confirm);
      nav('/');
    } catch (err: any) {
      setErrorKey('auth.resetPassword.errors.generic');
    }
  }

  return (
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">{t('auth.resetPassword.title')}</h2>
      <form onSubmit={submit} className="space-y-2">
        {errorKey && <p className="text-red-600 mb-2">{t(errorKey)}</p>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder={t('common.newPasswordPlaceholder')}
          className="w-full border p-2"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder={t('common.confirmPasswordPlaceholder')}
          className="w-full border p-2"
        />
        <button type="submit" className="w-full bg-brand text-white p-2">{t('common.updatePassword')}</button>
      </form>
    </div>
  );
}
