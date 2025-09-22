import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const { t } = useTranslation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey('');
    try {
      await register(email, password);
      nav('/dashboard');
    } catch (err: any) {
      setErrorKey('auth.register.errors.generic');
    }
  }

  return (
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">{t('auth.register.title')}</h2>
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
        <button type="submit" className="w-full bg-brand text-white p-2">{t('auth.register.submit')}</button>
      </form>
      <div className="mt-4 text-sm">
        <Link to="/login" className="text-brand">{t('auth.register.linkLogin')}</Link>
      </div>
    </div>
  );
}
