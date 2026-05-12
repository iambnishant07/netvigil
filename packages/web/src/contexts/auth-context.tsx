import { createContext, useContext, useState, type ReactNode } from 'react';
import type { AuthResponse, User } from '@aankhanet/shared-types';
import { clearTokens, storeTokens } from '../lib/api-client.ts';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isPending: boolean;
  login: (response: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): User | null {
  const raw = localStorage.getItem('nv_user');
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as User;
  } catch {
    // corrupted – fall through
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser);

  function login(response: AuthResponse): void {
    storeTokens(response.accessToken ?? '', response.refreshToken ?? '');
    localStorage.setItem('nv_user', JSON.stringify(response.user));
    setUser(response.user ?? null);
  }

  function logout(): void {
    clearTokens();
    localStorage.removeItem('nv_user');
    setUser(null);
  }

  const isPending = user?.status === 'pending';

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, isPending, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
