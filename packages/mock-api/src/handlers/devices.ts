import { http, HttpResponse } from 'msw';
import type { components } from '@netvigil/shared-types';

const BASE = 'http://localhost:8000/api/v1';

const mockDevice: components['schemas']['Device'] = {
  id: '018e1234-0000-7000-8000-000000000010',
  organizationId: '018e1234-0000-7000-8000-000000000000',
  name: 'pfSense-Edge',
  vendor: 'pfsense',
  protocol: 'netflow',
  publicIp: '203.0.113.1',
  lastSeenAt: null,
  createdAt: '2024-01-01T00:00:00Z',
};

const mockList: components['schemas']['DeviceList'] = {
  items: [mockDevice],
  page: 1,
  pageSize: 25,
  total: 1,
};

export const deviceHandlers = [
  http.get(`${BASE}/devices`, () => HttpResponse.json(mockList)),
  http.post(`${BASE}/devices`, () =>
    HttpResponse.json({ ...mockDevice, sharedSecret: 'mock-secret-shown-once' }, { status: 201 }),
  ),
  http.get(`${BASE}/devices/:deviceId`, () => HttpResponse.json(mockDevice)),
  http.patch(`${BASE}/devices/:deviceId`, () => HttpResponse.json(mockDevice)),
  http.delete(`${BASE}/devices/:deviceId`, () => new HttpResponse(null, { status: 204 })),
];
