import * as SecureStore from 'expo-secure-store';
import { storeTokens, clearTokens, TOKEN_KEY, REFRESH_KEY, BIOMETRIC_KEY, apiClient } from '../src/lib/api-client';

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

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
});
