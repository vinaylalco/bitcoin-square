import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await register(email, password);
      nav('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
  }

  return (
    <div className="max-w-sm mx-auto p-4">
      <h2 className="text-xl mb-4">Register</h2>
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
        <button type="submit" className="w-full bg-brand text-white p-2">Create Account</button>
      </form>
      <div className="mt-4 text-sm">
        <Link to="/login" className="text-brand">Already have an account? Login</Link>
      </div>
    </div>
  );
}
