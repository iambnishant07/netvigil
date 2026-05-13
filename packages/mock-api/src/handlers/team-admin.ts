import { http, HttpResponse } from 'msw';

const BASE = 'http://localhost:8000/api/v1';

const mockOrgUser = {
  id: '018e1234-0000-7000-8000-000000000002',
  email: 'analyst@example.com',
  role: 'analyst',
  status: 'active',
  isActive: true,
  mfaEnrolled: false,
  createdAt: '2024-01-01T00:00:00Z',
};

const mockPendingUser = {
  ...mockOrgUser,
  id: '018e1234-0000-7000-8000-000000000003',
  email: 'pending@example.com',
  status: 'pending',
  isActive: false,
};

const mockAuditLog = {
  id: '018e1234-0000-7000-8000-000000000010',
  actorEmail: 'admin@example.com',
  action: 'login',
  targetType: null,
  targetId: null,
  metadata: {},
  createdAt: '2024-01-01T00:00:00Z',
};

const mockAdminOrg = {
  id: '018e1234-0000-7000-8000-000000000000',
  name: 'Test Org',
  timezone: 'Australia/Sydney',
  userCount: 2,
  createdAt: '2024-01-01T00:00:00Z',
};

const mockAdminUser = {
  id: '018e1234-0000-7000-8000-000000000001',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
  isActive: true,
  organizationId: '018e1234-0000-7000-8000-000000000000',
  organizationName: 'Test Org',
  mfaEnrolled: false,
  createdAt: '2024-01-01T00:00:00Z',
};

export const teamAdminHandlers = [
  http.get(`${BASE}/users`, () => HttpResponse.json([mockOrgUser])),
  http.patch(`${BASE}/users/:id`, () => HttpResponse.json(mockOrgUser)),
  http.post(`${BASE}/users/:id/approve`, () => HttpResponse.json({ ...mockPendingUser, status: 'active', isActive: true })),
  http.post(`${BASE}/users/:id/reject`, () => HttpResponse.json({ ...mockPendingUser, status: 'rejected' })),

  http.get(`${BASE}/audit-logs`, () => HttpResponse.json([mockAuditLog])),

  http.get(`${BASE}/admin/organizations`, () => HttpResponse.json([mockAdminOrg])),
  http.get(`${BASE}/admin/users`, () => HttpResponse.json([mockAdminUser])),
  http.get(`${BASE}/admin/organizations/:orgId/users`, () => HttpResponse.json([mockAdminUser])),
  http.patch(`${BASE}/admin/users/:id`, () => HttpResponse.json(mockAdminUser)),
  http.delete(`${BASE}/admin/users/:id`, () => new HttpResponse(null, { status: 204 })),

  http.patch(`${BASE}/auth/me`, () => HttpResponse.json({
    id: '018e1234-0000-7000-8000-000000000001',
    organizationId: '018e1234-0000-7000-8000-000000000000',
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
    mfaEnrolled: false,
    createdAt: '2024-01-01T00:00:00Z',
    fullName: 'Test User',
  })),

  http.post(`${BASE}/seed`, () => HttpResponse.json({ seeded: { incidents: 20, devices: 2, alertRules: 3 } })),
];
