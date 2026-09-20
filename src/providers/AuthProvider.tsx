import type { Session } from "@supabase/supabase-js";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import { supabase } from "@/src/lib/supabase";
import type { Profile, UserSport } from "@/src/types/database";
import { asRow, asRows } from "@/src/types/database";

/**
 * AUTH PROVIDER — "centralny mózg" aplikacji.
 *
 * Trzyma w jednym miejscu: sesję logowania, profil z tabeli `profiles`
 * i listę dyscyplin użytkownika. Każdy ekran pobiera te dane przez useAuth().
 */

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  sports: UserSport[];
  /** true dopóki sprawdzamy, czy użytkownik jest już zalogowany */
  initializing: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sports, setSports] = useState<UserSport[]>([]);
  const [initializing, setInitializing] = useState(true);

  /** Dociąga profil i sporty dla aktualnie zalogowanego użytkownika. */
  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setSports([]);
      return;
    }

    const [profileResult, sportsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_sports").select("*").eq("user_id", userId),
    ]);

    if (profileResult.error) {
      console.warn(
        "[auth] nie udało się pobrać profilu:",
        profileResult.error.message,
      );
    }
    setProfile(asRow<Profile>(profileResult.data));
    setSports(asRows<UserSport>(sportsResult.data));
  }, []);

  // 1. Start aplikacji: odczytaj zapisaną sesję z pamięci telefonu.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (!cancelled) setInitializing(false);
    })();

    // 2. Nasłuchuj logowania / wylogowania / odświeżenia tokenu.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        void loadProfile(newSession?.user.id);
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    await loadProfile(session?.user.id);
  }, [loadProfile, session?.user.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) throw error;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSports([]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      sports,
      initializing,
      refresh,
      signIn,
      signUp,
      signOut,
    }),
    [session, profile, sports, initializing, refresh, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Skrót do danych użytkownika. Działa w każdym komponencie pod AuthProvider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth musi być użyty wewnątrz <AuthProvider>.");
  }
  return context;
}
