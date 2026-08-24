import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { api, getToken, setToken, ApiError } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

interface AuthResponse {
  token: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Returns null on success, or an error message. */
  login: (email: string, password: string) => Promise<string | null>;
  /** Returns null on success, or an error message. */
  register: (email: string, name: string, password: string) => Promise<string | null>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const token = getToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await api<User>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        setToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const data = await api<AuthResponse>('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      });
      setToken(data.token);
      setUser(data.user);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Не удалось войти';
    }
  }, []);

  const register = useCallback(
    async (email: string, name: string, password: string): Promise<string | null> => {
      try {
        const data = await api<AuthResponse>('/api/auth/register', {
          method: 'POST',
          auth: false,
          body: { email, name, password },
        });
        setToken(data.token);
        setUser(data.user);
        return null;
      } catch (err) {
        return err instanceof ApiError ? err.message : 'Не удалось зарегистрироваться';
      }
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
