import * as SecureStore from 'expo-secure-store';

const BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:8000/api/v1';

export const TOKEN_KEY = 'nv_access_token';
export const REFRESH_KEY = 'nv_refresh_token';
export const BIOMETRIC_KEY = 'nv_biometric_enabled';

export async function storeTokens(access: string, refresh: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_KEY),
    SecureStore.deleteItemAsync('nv_user'),
  ]);
}

async function tryRefresh(): Promise<string> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) throw new Error('No refresh token');

  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    await clearTokens();
    throw new Error('Session expired. Please log in again.');
  }

  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  await storeTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const tok = await SecureStore.getItemAsync(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`${BASE}${path}`, { ...(init ?? {}), headers });

  if (res.status === 401 && retry) {
    const newToken = await tryRefresh();
    const retryHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newToken}`,
    };
    const retryRes = await fetch(`${BASE}${path}`, { ...(init ?? {}), headers: retryHeaders });
    if (!retryRes.ok) {
      const body = (await retryRes.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? retryRes.statusText);
    }
    if (retryRes.status === 204) return undefined as T;
    return retryRes.json() as Promise<T>;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get:    <T>(path: string)                => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string)                   => request<void>(path, { method: 'DELETE' }),
};
