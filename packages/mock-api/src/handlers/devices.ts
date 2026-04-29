import { http, HttpResponse } from 'msw';
import type { components } from '@netvigil/shared-types';

const BASE = 'http://localhost:8000/api/v1';

type Device = components['schemas']['Device'];

const ORG = '018e1234-0000-7000-8000-000000000000';

const SEED: Device[] = [
  {
    id: '018e1234-0000-7000-8000-000000000010',
    organizationId: ORG,
    name: 'pfSense-Edge',
    vendor: 'pfsense',
    protocol: 'netflow',
    publicIp: '203.0.113.1',
    location: { lat: -37.8136, lng: 144.9631 },
    lastSeenAt: '2026-04-29T04:58:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '018e1234-0000-7000-8000-000000000011',
    organizationId: ORG,
    name: 'MikroTik-Core',
    vendor: 'mikrotik',
    protocol: 'syslog',
    publicIp: '203.0.113.2',
    location: { lat: -33.8688, lng: 151.2093 },
    lastSeenAt: '2026-04-29T04:55:00Z',
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: '018e1234-0000-7000-8000-000000000012',
    organizationId: ORG,
    name: 'OPNsense-DMZ',
    vendor: 'opnsense',
    protocol: 'netflow',
    publicIp: '203.0.113.3',
    lastSeenAt: null,
    createdAt: '2026-02-10T00:00:00Z',
  },
  {
    id: '018e1234-0000-7000-8000-000000000013',
    organizationId: ORG,
    name: 'FortiGate-Branch',
    vendor: 'fortigate',
    protocol: 'syslog',
    publicIp: '203.0.113.4',
    location: { lat: -27.4705, lng: 153.026 },
    lastSeenAt: '2026-04-28T12:00:00Z',
    createdAt: '2026-03-01T00:00:00Z',
  },
];

let store = [...SEED];
let counter = 20;

function makeId(): string {
  counter++;
  return `018e1234-0000-7000-8000-0000000000${String(counter).padStart(2, '0')}`;
}

export const deviceHandlers = [
  http.get(`${BASE}/devices`, ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '25');
    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      items: store.slice(start, start + pageSize),
      page,
      pageSize,
      total: store.length,
    });
  }),

  http.post(`${BASE}/devices`, async ({ request }) => {
    const body = (await request.json()) as components['schemas']['DeviceCreate'];
    const device: Device = {
      id: makeId(),
      organizationId: ORG,
      name: body.name,
      vendor: body.vendor,
      protocol: body.protocol,
      publicIp: body.publicIp,
      ...(body.location !== undefined ? { location: body.location } : {}),
      lastSeenAt: null,
      createdAt: new Date().toISOString(),
    };
    store.push(device);
    return HttpResponse.json({ ...device, sharedSecret: 'nv-secret-shown-once-keep-safe' }, { status: 201 });
  }),

  http.get(`${BASE}/devices/:deviceId`, ({ params }) => {
    const device = store.find((d) => d.id === params['deviceId']);
    if (!device) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(device);
  }),

  http.patch(`${BASE}/devices/:deviceId`, async ({ params, request }) => {
    const idx = store.findIndex((d) => d.id === params['deviceId']);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as components['schemas']['DeviceUpdate'];
    if (body.name !== undefined) store[idx] = { ...store[idx]!, name: body.name };
    if (body.location !== undefined) store[idx] = { ...store[idx]!, location: body.location };
    return HttpResponse.json(store[idx]);
  }),

  http.delete(`${BASE}/devices/:deviceId`, ({ params }) => {
    store = store.filter((d) => d.id !== params['deviceId']);
    return new HttpResponse(null, { status: 204 });
  }),
];
