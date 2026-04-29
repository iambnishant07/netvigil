import { http, HttpResponse } from 'msw';
import type { components } from '@netvigil/shared-types';

const BASE = 'http://localhost:8000/api/v1';

const mockKpis: components['schemas']['DashboardKpis'] = {
  eventsPerSecond: 1234.5,
  openIncidentsBySeverity: { info: 12, low: 5, medium: 3, high: 1, critical: 0 },
  topInternalTalkers: [{ ip: '10.0.0.5', bytes: 1073741824 }],
  topExternalDestinations: [{ ip: '93.184.216.34', country: 'US', bytes: 524288000 }],
};

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard/kpis`, () => HttpResponse.json(mockKpis)),
  http.get(`${BASE}/dashboard/threat-map`, () =>
    HttpResponse.json({
      center: { lat: -33.8688, lng: 151.2093 },
      arcs: [],
    }),
  ),
];
