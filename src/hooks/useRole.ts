import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * useRole
 * - Returns { role: "admin" | "user" | null, loading }
 * - Matches email against VITE_ADMIN_EMAILS
 */
export function useRole() {
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkRole() {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user?.email?.toLowerCase();

      const adminList = (import.meta.env.VITE_ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (mounted) {
        if (email && adminList.includes(email)) {
          setRole("admin");
        } else if (email) {
          setRole("user");
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    }

    checkRole();

    const { data: sub } = supabase.auth.onAuthStateChange(() => checkRole());
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);
  
  return { role, loading };
}
