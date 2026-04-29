import { http, HttpResponse } from 'msw';
import type { components } from '@netvigil/shared-types';

const BASE = 'http://localhost:8000/api/v1';

type AlertRule = components['schemas']['AlertRule'];

const ORG = '018e1234-0000-7000-8000-000000000000';

const SEED: AlertRule[] = [
  {
    id: '018e1234-0000-7000-8000-000000000030',
    organizationId: ORG,
    name: 'Critical incidents — email',
    minSeverity: 'critical',
    mitreFilter: [],
    channel: 'email',
    targetUserId: null,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '018e1234-0000-7000-8000-000000000031',
    organizationId: ORG,
    name: 'High & above — SMS',
    minSeverity: 'high',
    mitreFilter: [],
    channel: 'sms',
    targetUserId: null,
    enabled: true,
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: '018e1234-0000-7000-8000-000000000032',
    organizationId: ORG,
    name: 'All anomalies — push',
    minSeverity: 'info',
    mitreFilter: [],
    channel: 'push',
    targetUserId: null,
    enabled: false,
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    id: '018e1234-0000-7000-8000-000000000033',
    organizationId: ORG,
    name: 'C2 beaconing — email',
    minSeverity: 'medium',
    mitreFilter: ['T1071', 'T1095'],
    channel: 'email',
    targetUserId: null,
    enabled: true,
    createdAt: '2026-03-01T00:00:00Z',
  },
];

let store = [...SEED];
let counter = 40;

function makeId(): string {
  counter++;
  return `018e1234-0000-7000-8000-0000000000${String(counter).padStart(2, '0')}`;
}

export const alertRuleHandlers = [
  http.get(`${BASE}/alert-rules`, () => HttpResponse.json(store)),

  http.post(`${BASE}/alert-rules`, async ({ request }) => {
    const body = (await request.json()) as components['schemas']['AlertRuleCreate'];
    const rule: AlertRule = {
      id: makeId(),
      organizationId: ORG,
      name: body.name,
      minSeverity: body.minSeverity,
      mitreFilter: body.mitreFilter ?? [],
      channel: body.channel,
      targetUserId: body.targetUserId ?? null,
      enabled: body.enabled ?? true,
      createdAt: new Date().toISOString(),
    };
    store.push(rule);
    return HttpResponse.json(rule, { status: 201 });
  }),

  http.patch(`${BASE}/alert-rules/:ruleId`, async ({ params, request }) => {
    const idx = store.findIndex((r) => r.id === params['ruleId']);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as components['schemas']['AlertRuleUpdate'];
    store[idx] = { ...store[idx]!, ...body };
    return HttpResponse.json(store[idx]);
  }),

  http.delete(`${BASE}/alert-rules/:ruleId`, ({ params }) => {
    store = store.filter((r) => r.id !== params['ruleId']);
    return new HttpResponse(null, { status: 204 });
  }),
];
