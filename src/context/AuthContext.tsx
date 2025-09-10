import React, { createContext, useContext, useEffect, useState } from "react";
import { strapiFetch } from "../api/strapi-client";

interface User {
  id: number;
  username: string;
  email: string;
  [key: string]: unknown;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("jwt");
    const storedUser = localStorage.getItem("user");
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleAuth = async (data: any) => {
    setToken(data.jwt);
    localStorage.setItem("jwt", data.jwt);
    const profile = await strapiFetch<User>("/api/users/me");
    setUser(profile);
    localStorage.setItem("user", JSON.stringify(profile));
  };

  const login = async (identifier: string, password: string) => {
    const data = await strapiFetch("/api/auth/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    await handleAuth(data);
  };

  const register = async (email: string, password: string) => {
    const data = await strapiFetch("/api/auth/local/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username: email }),
    });
    await handleAuth(data);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("jwt");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

