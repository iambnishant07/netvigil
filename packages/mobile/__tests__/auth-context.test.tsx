import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/contexts/auth-context';

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../src/lib/api-client', () => ({
  TOKEN_KEY:                     'nv_access_token',
  REFRESH_KEY:                   'nv_refresh_token',
  BIOMETRIC_KEY:                 'nv_biometric_enabled',
  storeTokens:                   jest.fn().mockResolvedValue(undefined),
  clearTokens:                   jest.fn().mockResolvedValue(undefined),
  registerSessionExpiredHandler: jest.fn(),
  apiClient:                     {},
}));

import * as SecureStore from 'expo-secure-store';

const mockUser = {
  id: 'u-1', organizationId: 'org-1', email: 'analyst@example.com',
  role: 'analyst' as const, mfaEnrolled: false, createdAt: '2026-01-01T00:00:00Z',
};
const mockAuthResponse = {
  accessToken:  'at-abc',
  refreshToken: 'rt-def',
  expiresIn:    900,
  user:         mockUser,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const settle = () => act(async () => { await new Promise<void>((r) => setTimeout(r, 100)); });

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it('starts loading and resolves to unauthenticated when no stored token', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await settle();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login authenticates the user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await settle();
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => { await result.current.login(mockAuthResponse); });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('analyst@example.com');
  });

  it('logout clears authentication', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await settle();

    await act(async () => { await result.current.login(mockAuthResponse); });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => { await result.current.logout(); });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('setBiometric(true) stores flag and enables biometric', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await settle();

    await act(async () => { await result.current.setBiometric(true); });

    expect(result.current.biometricEnabled).toBe(true);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('nv_biometric_enabled', 'true');
  });

  it('setBiometric(false) removes flag and disables biometric', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await settle();

    await act(async () => { await result.current.setBiometric(false); });

    expect(result.current.biometricEnabled).toBe(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('nv_biometric_enabled');
  });

  it('hydrates from SecureStore on mount when token present', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === 'nv_access_token') return Promise.resolve('stored-token');
      if (key === 'nv_user')         return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await settle();

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('analyst@example.com');
  });
});
