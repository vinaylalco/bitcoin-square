/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import {
  supabase,
  type SupabaseAuthSession,
  type SupabaseAuthUser,
} from '../lib/supabaseClient';

type DecryptedJournalEntry = unknown;

export type JournalSessionContextValue = {
  currentUser: SupabaseAuthUser | null;
  decryptedJournalEntries: DecryptedJournalEntry[];
  hasJournalSecret: boolean;
  journalSecret: string | null;
  loadingAuthState: boolean;
  session: SupabaseAuthSession;
  clearDecryptedJournalEntries: () => void;
  logout: () => Promise<void>;
  setDecryptedJournalEntries: React.Dispatch<React.SetStateAction<DecryptedJournalEntry[]>>;
  setJournalSecret: React.Dispatch<React.SetStateAction<string | null>>;
  setSession: React.Dispatch<React.SetStateAction<SupabaseAuthSession>>;
  unlockJournal: (secret: string) => void;
};

export const JournalSessionContext = createContext<JournalSessionContextValue | null>(null);

export function JournalSessionProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<SupabaseAuthUser | null>(null);
  const [loadingAuthState, setLoadingAuthState] = useState(true);
  const [session, setSession] = useState<SupabaseAuthSession>(null);
  const [journalSecret, setJournalSecret] = useState<string | null>(null);
  const [decryptedJournalEntries, setDecryptedJournalEntries] = useState<DecryptedJournalEntry[]>([]);

  const clearDecryptedJournalEntries = useCallback(() => {
    setDecryptedJournalEntries([]);
  }, []);

  const unlockJournal = useCallback((secret: string) => {
    setJournalSecret(secret);
  }, []);

  const logout = useCallback(async () => {
    const accessToken = session?.access_token ?? null;
    setSession(null);
    setCurrentUser(null);
    setJournalSecret(null);
    setDecryptedJournalEntries([]);
    await supabase.auth.signOut(accessToken);
  }, [session?.access_token]);

  useEffect(() => {
    let mounted = true;

    const subscription = supabase.auth.onAuthStateChange((_event, data) => {
      if (!mounted) return;
      setSession(data.session);
      setCurrentUser(data.user);
      if (!data.user) {
        setJournalSecret(null);
        setDecryptedJournalEntries([]);
      }
      setLoadingAuthState(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setCurrentUser(data.user);
      setLoadingAuthState(false);
    });

    return () => {
      mounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<JournalSessionContextValue>(
    () => ({
      currentUser,
      decryptedJournalEntries,
      hasJournalSecret: Boolean(journalSecret),
      journalSecret,
      loadingAuthState,
      session,
      clearDecryptedJournalEntries,
      logout,
      setDecryptedJournalEntries,
      setJournalSecret,
      setSession,
      unlockJournal,
    }),
    [
      clearDecryptedJournalEntries,
      currentUser,
      decryptedJournalEntries,
      journalSecret,
      loadingAuthState,
      logout,
      session,
      unlockJournal,
    ],
  );

  return <JournalSessionContext.Provider value={value}>{children}</JournalSessionContext.Provider>;
}
