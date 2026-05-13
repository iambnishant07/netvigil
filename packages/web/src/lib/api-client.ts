const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

function getToken(): string | null {
  return localStorage.getItem('nv_access_token');
}

export function storeTokens(access: string, refresh: string): void {
  localStorage.setItem('nv_access_token', access);
  localStorage.setItem('nv_refresh_token', refresh);
}

export function clearTokens(): void {
  localStorage.removeItem('nv_access_token');
  localStorage.removeItem('nv_refresh_token');
}

async function tryRefresh(): Promise<boolean> {
  const rt = localStorage.getItem('nv_refresh_token');
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) { clearTokens(); return false; }

    const data = await res.json() as { accessToken: string; refreshToken: string };
    storeTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const tok = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tok !== null) headers['Authorization'] = `Bearer ${tok}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...(init ?? {}), headers });
  } catch {
    throw new Error('Network error — check your connection and try again');
  }

  if (res.status === 401 && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, init, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as {
      message?: string;
      detail?: string | { message?: string } | unknown[];
    } | null;
    const detail = body?.detail;
    let msg: string =
      body?.message ??
      (typeof detail === 'string' ? detail :
       (detail && !Array.isArray(detail) && typeof detail === 'object' && 'message' in detail)
         ? String((detail as { message?: unknown }).message ?? '')
         : null) ??
      res.statusText;
    if (!msg) msg = 'Request failed';
    throw new Error(msg);
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
