import { http, HttpResponse } from 'msw';
import type { components } from '@netvigil/shared-types';

const BASE = 'http://localhost:8000/api/v1';

const mockKpis: components['schemas']['DashboardKpis'] = {
  eventsPerSecond: 3847.2,
  openIncidentsBySeverity: { info: 3, low: 8, medium: 6, high: 4, critical: 2 },
  topInternalTalkers: [
    { ip: '10.0.0.5',    bytes: 2147483648 },
    { ip: '10.0.0.12',   bytes: 1073741824 },
    { ip: '10.0.1.23',   bytes: 536870912  },
    { ip: '172.16.0.4',  bytes: 268435456  },
    { ip: '192.168.1.100', bytes: 134217728 },
  ],
  topExternalDestinations: [
    { ip: '93.184.216.34',  country: 'US', bytes: 1073741824 },
    { ip: '104.18.32.68',   country: 'AU', bytes: 536870912  },
    { ip: '151.101.1.140',  country: 'GB', bytes: 268435456  },
    { ip: '13.107.42.16',   country: 'US', bytes: 134217728  },
    { ip: '198.51.100.99',  country: 'CN', bytes: 67108864   },
  ],
};

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard/kpis`, () => HttpResponse.json(mockKpis)),

  http.get(`${BASE}/dashboard/threat-map`, () =>
    HttpResponse.json({
      center: { lat: -33.8688, lng: 151.2093 },
      arcs: [
        { from: { lat: 39.9042, lng: 116.4074 }, to: { lat: -33.8688, lng: 151.2093 }, count: 127, severity: 'critical', sourceCountry: 'CN' },
        { from: { lat: 37.0902, lng: -95.7129 }, to: { lat: -37.8136, lng: 144.9631 }, count: 43,  severity: 'high',     sourceCountry: 'US' },
        { from: { lat: 55.7558, lng: 37.6173 },  to: { lat: -33.8688, lng: 151.2093 }, count: 18,  severity: 'medium',   sourceCountry: 'RU' },
        { from: { lat: 51.5074, lng: -0.1278 },  to: { lat: -27.4705, lng: 153.026  }, count: 9,   severity: 'low',      sourceCountry: 'GB' },
      ],
    }),
  ),
];
