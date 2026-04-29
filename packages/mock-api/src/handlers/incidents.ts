import { http, HttpResponse } from 'msw';
import type { components } from '@netvigil/shared-types';

const BASE = 'http://localhost:8000/api/v1';

const mockIncident: components['schemas']['Incident'] = {
  id: '018e1234-0000-7000-8000-000000000020',
  organizationId: '018e1234-0000-7000-8000-000000000000',
  deviceId: '018e1234-0000-7000-8000-000000000010',
  detectedAt: '2024-01-15T02:30:00Z',
  severity: 'high',
  status: 'open',
  attackLabel: 'port_scan',
  mitreTechnique: 'T1046',
  sourceIp: '198.51.100.99',
  destinationIp: '10.0.0.5',
  anomalyScore: 0.91,
  narrative: null,
  topFeatures: [{ name: 'packet_rate', value: 4500 }],
};

const mockList: components['schemas']['IncidentList'] = {
  items: [mockIncident],
  page: 1,
  pageSize: 25,
  total: 1,
};

export const incidentHandlers = [
  http.get(`${BASE}/incidents`, () => HttpResponse.json(mockList)),
  http.get(`${BASE}/incidents/:incidentId`, () => HttpResponse.json(mockIncident)),
  http.patch(`${BASE}/incidents/:incidentId`, () => HttpResponse.json(mockIncident)),
];
