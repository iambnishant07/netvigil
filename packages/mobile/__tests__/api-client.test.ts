import * as SecureStore from 'expo-secure-store';
import { storeTokens, clearTokens, TOKEN_KEY, REFRESH_KEY, BIOMETRIC_KEY, apiClient } from '../src/lib/api-client';

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockFetch = jest.fn();
Object.assign(globalThis, { fetch: mockFetch as typeof fetch });

describe('storeTokens', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes access and refresh tokens to SecureStore', async () => {
    await storeTokens('acc-token', 'ref-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, 'acc-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(REFRESH_KEY, 'ref-token');
  });
});

describe('clearTokens', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes all token keys from SecureStore', async () => {
    await clearTokens();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(BIOMETRIC_KEY);
  });
});

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: 'ok' }),
    });
  });

  it('GET sends Authorization header when token available', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('bearer-token');
    await apiClient.get<{ result: string }>('/test-path');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test-path'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer bearer-token' }),
      }),
    );
  });

  it('GET omits Authorization header when no token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await apiClient.get<{ result: string }>('/no-auth');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/no-auth'),
      expect.objectContaining({ headers: expect.not.objectContaining({ Authorization: expect.any(String) }) }),
    );
  });

  it('POST includes method and body', async () => {
    await apiClient.post('/items', { name: 'test' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'test' }) }),
    );
  });

  it('PATCH includes method and body', async () => {
    await apiClient.patch('/items/1', { enabled: false });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('DELETE sends DELETE method', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve() });
    await apiClient.delete('/items/1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('throws when response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ message: 'Access denied' }),
    });
    await expect(apiClient.get('/protected')).rejects.toThrow('Access denied');
  });

  it('falls back to statusText when error body has no message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    });
    await expect(apiClient.get('/fail')).rejects.toThrow('Internal Server Error');
  });

  it('returns undefined for 204 response', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve() });
    const result = await apiClient.get('/no-content');
    expect(result).toBeUndefined();
  });

  it('retries with refresh token on 401', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('expired-token')   // first call: get access token
      .mockResolvedValueOnce('refresh-token');   // second call: get refresh token

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ accessToken: 'new-at', refreshToken: 'new-rt' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ result: 'ok' }) });

    const result = await apiClient.get<{ result: string }>('/guarded');
    expect(result).toEqual({ result: 'ok' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws when refresh token is absent', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('expired-token')
      .mockResolvedValueOnce(null); // no refresh token

    mockFetch.mockResolvedValueOnce({
      ok: false, status: 401, statusText: 'Unauthorized', json: () => Promise.resolve({}),
    });

    await expect(apiClient.get('/guarded')).rejects.toThrow('No refresh token');
  });

  it('throws when refresh request fails', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('expired-token')
      .mockResolvedValueOnce('refresh-token');

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', json: () => Promise.resolve({}) });

    await expect(apiClient.get('/guarded')).rejects.toThrow('Session expired');
  });

  it('PUT includes method and body', async () => {
    await apiClient.put('/items/1', { name: 'updated' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
