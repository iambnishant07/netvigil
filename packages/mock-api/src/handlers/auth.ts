import { http, HttpResponse } from 'msw';
import type { components } from '@aankhanet/shared-types';

const BASE = 'http://localhost:8000/api/v1';

const mockUser: components['schemas']['User'] = {
  id: '018e1234-0000-7000-8000-000000000001',
  organizationId: '018e1234-0000-7000-8000-000000000000',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
  mfaEnrolled: false,
  createdAt: '2024-01-01T00:00:00Z',
};

const mockAuthResponse: components['schemas']['AuthResponse'] = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
  user: mockUser,
  mfaRequired: false,
  needsOrgSelection: false,
};

export const authHandlers = [
  http.post(`${BASE}/auth/register`, () => HttpResponse.json(mockAuthResponse, { status: 201 })),
  http.post(`${BASE}/auth/login`, () => HttpResponse.json(mockAuthResponse)),
  http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(mockAuthResponse)),
  http.get(`${BASE}/auth/me`, () => HttpResponse.json(mockUser)),
  http.get(`${BASE}/auth/organizations`, () => HttpResponse.json([])),
];
