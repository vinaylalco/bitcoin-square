import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const { reset } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    try {
      await reset(code, password, confirm);
      nav('/');
    } catch (err: any) {
      setError(err.message || 'Reset failed');
    }
  }

  return (
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">Set New Password</h2>
      <form onSubmit={submit} className="space-y-2">
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="New password"
          className="w-full border p-2"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Confirm password"
          className="w-full border p-2"
        />
        <button type="submit" className="w-full bg-brand text-white p-2">Update Password</button>
      </form>
    </div>
  );
}
