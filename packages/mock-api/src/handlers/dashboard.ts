import { http, HttpResponse } from 'msw';
import type { components } from '@aankhanet/shared-types';

const BASE = 'http://localhost:8000/api/v1';

const mockKpis: components['schemas']['DashboardKpis'] = {
  eventsPerSecond: 5214.7,
  openIncidentsBySeverity: { info: 7, low: 14, medium: 11, high: 6, critical: 3 },
  topInternalTalkers: [
    { ip: '10.0.0.5',      bytes: 4831838208 },
    { ip: '10.0.0.12',     bytes: 2684354560 },
    { ip: '10.0.1.23',     bytes: 1879048192 },
    { ip: '172.16.0.4',    bytes: 1073741824 },
    { ip: '10.0.2.88',     bytes: 805306368  },
    { ip: '192.168.1.100', bytes: 536870912  },
    { ip: '172.16.5.201',  bytes: 268435456  },
    { ip: '10.10.0.9',     bytes: 134217728  },
  ],
  topExternalDestinations: [
    { ip: '101.33.221.14',  country: 'CN', bytes: 2147483648 },
    { ip: '185.220.101.47', country: 'RU', bytes: 1610612736 },
    { ip: '93.184.216.34',  country: 'US', bytes: 1073741824 },
    { ip: '104.18.32.68',   country: 'AU', bytes: 536870912  },
    { ip: '91.108.4.183',   country: 'NL', bytes: 402653184  },
    { ip: '151.101.1.140',  country: 'GB', bytes: 268435456  },
    { ip: '45.142.212.100', country: 'DE', bytes: 201326592  },
    { ip: '198.51.100.99',  country: 'KP', bytes: 134217728  },
    { ip: '103.235.46.39',  country: 'IN', bytes: 67108864   },
  ],
};

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard/kpis`, () => HttpResponse.json(mockKpis)),

  http.get(`${BASE}/dashboard/threat-map`, () =>
    HttpResponse.json({
      center: { lat: -33.8688, lng: 151.2093 },
      arcs: [
        // Critical — China → Sydney
        { from: { lat: 39.9042,  lng: 116.4074  }, to: { lat: -33.8688, lng: 151.2093 }, count: 214, severity: 'critical', sourceCountry: 'CN' },
        // Critical — North Korea → Melbourne
        { from: { lat: 39.0392,  lng: 125.7625  }, to: { lat: -37.8136, lng: 144.9631 }, count: 87,  severity: 'critical', sourceCountry: 'KP' },
        // High — Russia → Sydney
        { from: { lat: 55.7558,  lng: 37.6173   }, to: { lat: -33.8688, lng: 151.2093 }, count: 143, severity: 'high',     sourceCountry: 'RU' },
        // High — USA (east coast) → Brisbane
        { from: { lat: 37.0902,  lng: -95.7129  }, to: { lat: -27.4705, lng: 153.026  }, count: 62,  severity: 'high',     sourceCountry: 'US' },
        // High — Iran → Perth
        { from: { lat: 35.6892,  lng: 51.3890   }, to: { lat: -31.9505, lng: 115.8605 }, count: 38,  severity: 'high',     sourceCountry: 'IR' },
        // Medium — UK → Sydney
        { from: { lat: 51.5074,  lng: -0.1278   }, to: { lat: -33.8688, lng: 151.2093 }, count: 31,  severity: 'medium',   sourceCountry: 'GB' },
        // Medium — Brazil → Adelaide
        { from: { lat: -15.7801, lng: -47.9292  }, to: { lat: -34.9285, lng: 138.6007 }, count: 24,  severity: 'medium',   sourceCountry: 'BR' },
        // Medium — Netherlands → Melbourne
        { from: { lat: 52.3676,  lng: 4.9041    }, to: { lat: -37.8136, lng: 144.9631 }, count: 19,  severity: 'medium',   sourceCountry: 'NL' },
        // Medium — India → Sydney
        { from: { lat: 28.6139,  lng: 77.2090   }, to: { lat: -33.8688, lng: 151.2093 }, count: 15,  severity: 'medium',   sourceCountry: 'IN' },
        // Low — Germany → Brisbane
        { from: { lat: 52.5200,  lng: 13.4050   }, to: { lat: -27.4705, lng: 153.026  }, count: 11,  severity: 'low',      sourceCountry: 'DE' },
        // Low — Singapore → Sydney
        { from: { lat: 1.3521,   lng: 103.8198  }, to: { lat: -33.8688, lng: 151.2093 }, count: 8,   severity: 'low',      sourceCountry: 'SG' },
        // Low — Japan → Melbourne
        { from: { lat: 35.6762,  lng: 139.6503  }, to: { lat: -37.8136, lng: 144.9631 }, count: 6,   severity: 'low',      sourceCountry: 'JP' },
      ],
    }),
  ),

  http.get(`${BASE}/dashboard/trend`, () =>
    HttpResponse.json({
      days: [
        { date: '2026-05-07', critical: 3,  high: 7,  medium: 11, low: 16, info: 8  },
        { date: '2026-05-08', critical: 2,  high: 9,  medium: 8,  low: 14, info: 11 },
        { date: '2026-05-09', critical: 5,  high: 6,  medium: 13, low: 12, info: 9  },
        { date: '2026-05-10', critical: 2,  high: 11, medium: 10, low: 18, info: 6  },
        { date: '2026-05-11', critical: 7,  high: 8,  medium: 15, low: 10, info: 13 },
        { date: '2026-05-12', critical: 4,  high: 13, medium: 12, low: 15, info: 7  },
        { date: '2026-05-13', critical: 3,  high: 6,  medium: 11, low: 14, info: 7  },
      ],
    }),
  ),

  http.get(`${BASE}/dashboard/attack-types`, () =>
    HttpResponse.json({
      c2_beaconing: 127,
      brute_force: 84,
      ddos: 43,
      port_scan: 312,
      data_exfil: 19,
      lateral_movement: 56,
      unknown_anomaly: 28,
    }),
  ),
];
