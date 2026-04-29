const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

function getToken(): string | null {
  return localStorage.getItem('nv_access_token');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const tok = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tok !== null) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`${BASE}${path}`, { ...(init ?? {}), headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string } | null;
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

export function storeTokens(access: string, refresh: string): void {
  localStorage.setItem('nv_access_token', access);
  localStorage.setItem('nv_refresh_token', refresh);
}

export function clearTokens(): void {
  localStorage.removeItem('nv_access_token');
  localStorage.removeItem('nv_refresh_token');
}
