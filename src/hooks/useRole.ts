import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Role = "admin" | "user" | null;
const CACHE_KEY = "bsq.role.v2";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

type CacheShape = { role: Role; email?: string; ts: number };

function readCache(): CacheShape | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeCache(role: Role, email?: string) {
  try {
    const payload: CacheShape = { role, email, ts: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {}
}
function computeRole(email?: string | null): Role {
  const admins = (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!email) return null;
  return admins.includes(email.toLowerCase()) ? "admin" : "user";
}

/**
 * useRole()
 * - Hydrates from session cache immediately (no flicker).
 * - Reconciles using supabase.auth.getUser() (fast).
 * - Updates cache on auth changes.
 */
export function useRole() {
  const cached = readCache();
  const [role, setRole] = useState<Role>(cached?.role ?? null);
  const [loading, setLoading] = useState<boolean>(cached ? false : true);

  useEffect(() => {
    let alive = true;

    async function resolve() {
      try {
        const { data } = await supabase.auth.getUser(); // fast path
        const email = data?.user?.email ?? undefined;
        const r = computeRole(email);
        if (!alive) return;
        setRole(r);
        setLoading(false);
        writeCache(r, email);
      } catch {
        if (!alive) return;
        setRole(null);
        setLoading(false);
        writeCache(null);
      }
    }

    // If we had cache, render immediately; still reconcile silently.
    resolve();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      resolve();
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  return { role, loading };
}
