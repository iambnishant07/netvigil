import { http, HttpResponse } from 'msw';
import type { components } from '@netvigil/shared-types';

const BASE = 'http://localhost:8000/api/v1';

const mockRule: components['schemas']['AlertRule'] = {
  id: '018e1234-0000-7000-8000-000000000030',
  organizationId: '018e1234-0000-7000-8000-000000000000',
  name: 'High severity to email',
  minSeverity: 'high',
  channel: 'email',
  targetUserId: null,
  enabled: true,
  createdAt: '2024-01-01T00:00:00Z',
};

export const alertRuleHandlers = [
  http.get(`${BASE}/alert-rules`, () => HttpResponse.json([mockRule])),
  http.post(`${BASE}/alert-rules`, () => HttpResponse.json(mockRule, { status: 201 })),
  http.patch(`${BASE}/alert-rules/:ruleId`, () => HttpResponse.json(mockRule)),
  http.delete(`${BASE}/alert-rules/:ruleId`, () => new HttpResponse(null, { status: 204 })),
];
