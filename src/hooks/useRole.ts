import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Role = "admin" | "user" | null;
const CACHE_KEY = "bsq.role.v1";

function readCache(): { role: Role; email?: string } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(role: Role, email?: string) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ role, email }));
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

export function useRole() {
  const cached = readCache();
  const [role, setRole] = useState<Role>(cached?.role ?? null);
  const [loading, setLoading] = useState<boolean>(cached ? false : true);

  useEffect(() => {
    let alive = true;

    async function resolve() {
      try {
        const { data } = await supabase.auth.getUser();
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

    // hydrate immediately from cache, then reconcile
    resolve();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      resolve();
    });

    return () => sub?.subscription.unsubscribe();
  }, []);

  return { role, loading };
}
