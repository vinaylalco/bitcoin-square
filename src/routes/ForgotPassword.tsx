import React, { useState } from 'react';
import { forgotPassword } from '../api/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Request failed');
    }
  }

  return (
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">Reset Password</h2>
      {sent ? (
        <p>Check your email for a reset link.</p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {error && <p className="text-red-600 mb-2">{error}</p>}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="Email"
            className="w-full border p-2"
          />
          <button type="submit" className="w-full bg-brand text-white p-2">
            Send reset link
          </button>
        </form>
      )}
    </div>
  );
}
