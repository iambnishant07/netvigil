import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import type { AuthResponse, User } from '@netvigil/shared-types';
import { storeTokens, clearTokens, registerSessionExpiredHandler, TOKEN_KEY, BIOMETRIC_KEY } from '../lib/api-client';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isPending: boolean;
  isLoading: boolean;
  biometricEnabled: boolean;
  login: (response: AuthResponse) => Promise<void>;
  logout: () => Promise<void>;
  setBiometric: (enabled: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'nv_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                     = useState<User | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [biometricEnabled, setBiometricState] = useState(false);

  useEffect(() => {
    void hydrate();
    registerSessionExpiredHandler(async () => {
      setUser(null);
      setBiometricState(false);
    });
  }, []);

  async function hydrate() {
    try {
      const [token, bioFlag, storedUser] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(BIOMETRIC_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (token && storedUser) {
        if (bioFlag === 'true') {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Confirm your identity to open NetVigil',
            cancelLabel: 'Use password',
          });
          if (!result.success) {
            await clearTokens();
            setIsLoading(false);
            return;
          }
        }
        setUser(JSON.parse(storedUser) as User);
        setBiometricState(bioFlag === 'true');
      }
    } catch {
      // corrupted state — fall through to login
    } finally {
      setIsLoading(false);
    }
  }

  async function login(response: AuthResponse): Promise<void> {
    // mfaRequired responses carry no tokens — LoginScreen routes to MfaChallenge instead
    if (response.mfaRequired) return;
    await storeTokens(response.accessToken ?? '', response.refreshToken ?? '');
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(response.user));
    setUser(response.user ?? null);
  }

  async function logout(): Promise<void> {
    await clearTokens();
    setUser(null);
    setBiometricState(false);
  }

  async function setBiometric(enabled: boolean): Promise<void> {
    if (enabled) {
      await SecureStore.setItemAsync(BIOMETRIC_KEY, 'true');
    } else {
      await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
    }
    setBiometricState(enabled);
  }

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, isPending: user?.status === 'pending', isLoading, biometricEnabled, login, logout, setBiometric }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
