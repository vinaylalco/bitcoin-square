import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      nav('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">Login</h2>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form onSubmit={submit} className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="Email"
          className="w-full border p-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Password"
          className="w-full border p-2"
        />
        <button type="submit" className="w-full bg-brand text-white p-2">Log In</button>
      </form>
      <div className="mt-4 text-sm">
        <Link to="/register" className="text-brand">Create account</Link>
        {' | '}
        <Link to="/forgot-password" className="text-brand">Forgot password?</Link>
      </div>
    </div>
  );
}
