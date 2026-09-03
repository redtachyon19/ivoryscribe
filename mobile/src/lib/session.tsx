import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin, register as apiRegister, type AuthResponse } from '@shared/api';

type User = AuthResponse['user'];
export type Session = { token: string; user: User };

type SignUpResult = { needsVerification: boolean };

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
};

const SESSION_KEY = 'ivoryscribe.session';
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore a persisted session on cold start.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        if (active && raw) {
          setSession(JSON.parse(raw) as Session);
        }
      } catch {
        // Corrupt/absent store — start signed out.
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (next: Session | null) => {
    setSession(next);
    if (next) {
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
    } else {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password);
      await persist({ token: res.token, user: res.user });
    },
    [persist],
  );

  const signUp = useCallback(
    async (firstName: string, lastName: string, email: string, password: string) => {
      const res = await apiRegister(firstName, lastName, email, password);
      if ('requiresEmailVerification' in res) {
        // Account created but blocked on email verification — stay signed out.
        return { needsVerification: true };
      }
      await persist({ token: res.token, user: res.user });
      return { needsVerification: false };
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    await persist(null);
  }, [persist]);

  const value = useMemo(
    () => ({ session, isLoading, signIn, signUp, signOut }),
    [session, isLoading, signIn, signUp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
