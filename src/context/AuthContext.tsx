import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AuthResponse } from '../api/auth';
import { login as apiLogin, register as apiRegister, resetPassword as apiReset } from '../api/auth';

interface User { id: number; email: string; username?: string }
interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  reset: (code: string, password: string, confirm: string) => Promise<void>;
}

const AuthCtx = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try { return localStorage.getItem('jwt'); } catch { return null; }
  });

  useEffect(() => {
    if (!token) return;
    // In real app, verify token or fetch user
  }, [token]);

  function applyAuth(res: AuthResponse) {
    setUser(res.user);
    setToken(res.jwt);
    try { localStorage.setItem('jwt', res.jwt); } catch {}
  }

  async function login(email: string, password: string) {
    const res = await apiLogin(email, password);
    applyAuth(res);
  }

  async function register(email: string, password: string) {
    const res = await apiRegister(email, password);
    applyAuth(res);
  }

  async function reset(code: string, password: string, confirm: string) {
    const res = await apiReset(code, password, confirm);
    applyAuth(res);
  }

  function logout() {
    setUser(null);
    setToken(null);
    try { localStorage.removeItem('jwt'); } catch {}
  }

  return (
    <AuthCtx.Provider value={{ user, token, login, register, logout, reset }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
