// Standalone HTTP mock server — run with:
//   node --experimental-strip-types server.ts
// All mock data is inlined; no build step needed.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = 8000;
const BASE = '/api/v1';
const ORG = '018e1234-0000-7000-8000-000000000000';

// ── Seed data ────────────────────────────────────────────────────────────────

const mockUser = {
  id: '018e1234-0000-7000-8000-000000000001',
  organizationId: ORG,
  email: 'admin@example.com',
  role: 'admin',
  mfaEnrolled: false,
  createdAt: '2024-01-01T00:00:00Z',
};

const mockAuth = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
  user: mockUser,
};

const kpis = {
  eventsPerSecond: 3847.2,
  openIncidentsBySeverity: { info: 3, low: 8, medium: 6, high: 4, critical: 2 },
  topInternalTalkers: [
    { ip: '10.0.0.5',      bytes: 2147483648 },
    { ip: '10.0.0.12',     bytes: 1073741824 },
    { ip: '10.0.1.23',     bytes: 536870912  },
    { ip: '172.16.0.4',    bytes: 268435456  },
    { ip: '192.168.1.100', bytes: 134217728  },
  ],
  topExternalDestinations: [
    { ip: '93.184.216.34', country: 'US', bytes: 1073741824 },
    { ip: '104.18.32.68',  country: 'AU', bytes: 536870912  },
    { ip: '151.101.1.140', country: 'GB', bytes: 268435456  },
    { ip: '13.107.42.16',  country: 'US', bytes: 134217728  },
    { ip: '198.51.100.99', country: 'CN', bytes: 67108864   },
  ],
};

const threatMap = {
  center: { lat: -33.8688, lng: 151.2093 },
  arcs: [
    { from: { lat: 39.9042, lng: 116.4074 }, to: { lat: -33.8688, lng: 151.2093 }, count: 127, severity: 'critical', sourceCountry: 'CN' },
    { from: { lat: 37.0902, lng: -95.7129 }, to: { lat: -37.8136, lng: 144.9631 }, count: 43,  severity: 'high',     sourceCountry: 'US' },
    { from: { lat: 55.7558, lng: 37.6173  }, to: { lat: -33.8688, lng: 151.2093 }, count: 18,  severity: 'medium',   sourceCountry: 'RU' },
    { from: { lat: 51.5074, lng: -0.1278  }, to: { lat: -27.4705, lng: 153.026  }, count: 9,   severity: 'low',      sourceCountry: 'GB' },
  ],
};

const DEV = '018e1234-0000-7000-8000-000000000010';
let incidents = [
  { id: '018e1234-0000-7000-8000-000000000020', organizationId: ORG, deviceId: DEV, detectedAt: '2026-04-29T04:12:00Z', severity: 'critical', status: 'open', attackLabel: 'c2_beaconing', mitreTechnique: 'T1071', sourceIp: '198.51.100.99', destinationIp: '10.0.0.5', anomalyScore: 0.97, narrative: 'A host on the internal network is initiating periodic outbound connections to a known command-and-control infrastructure at 198.51.100.99. Beacon interval is approximately 60 seconds with a low jitter ratio, consistent with automated malware callback behaviour. Immediate isolation of the affected endpoint (10.0.0.5) is recommended.', topFeatures: [{ name: 'beacon_interval_std', value: 1.3 }, { name: 'packet_rate', value: 4500 }, { name: 'bytes_per_packet', value: 92 }] },
  { id: '018e1234-0000-7000-8000-000000000021', organizationId: ORG, deviceId: DEV, detectedAt: '2026-04-29T03:45:00Z', severity: 'high', status: 'open', attackLabel: 'port_scan', mitreTechnique: 'T1046', sourceIp: '203.0.113.77', destinationIp: '10.0.0.0/24', anomalyScore: 0.91, narrative: 'An external IP (203.0.113.77) performed a SYN sweep across 254 hosts in the 10.0.0.0/24 subnet in under 2 seconds.', topFeatures: [{ name: 'distinct_dst_ports', value: 254 }, { name: 'syn_ratio', value: 0.99 }, { name: 'flow_duration_ms', value: 1850 }] },
  { id: '018e1234-0000-7000-8000-000000000022', organizationId: ORG, deviceId: DEV, detectedAt: '2026-04-29T02:30:00Z', severity: 'high', status: 'acknowledged', attackLabel: 'brute_force', mitreTechnique: 'T1110', sourceIp: '198.51.100.55', destinationIp: '10.0.0.22', anomalyScore: 0.88, narrative: 'SSH service on 10.0.0.22 received 1,247 failed login attempts from a single source over 8 minutes.', topFeatures: [{ name: 'auth_failures', value: 1247 }, { name: 'unique_usernames', value: 38 }, { name: 'attempt_rate_per_min', value: 155 }] },
  { id: '018e1234-0000-7000-8000-000000000023', organizationId: ORG, deviceId: DEV, detectedAt: '2026-04-29T01:15:00Z', severity: 'critical', status: 'confirmed', attackLabel: 'data_exfil', mitreTechnique: 'T1048', sourceIp: '10.0.1.45', destinationIp: '185.220.101.34', anomalyScore: 0.95, narrative: 'Internal workstation 10.0.1.45 transferred 4.7 GB to an external Tor exit node over the past 2 hours using DNS-over-HTTPS tunnelling.', topFeatures: [{ name: 'upload_bytes', value: 4700000000 }, { name: 'dns_query_entropy', value: 4.8 }, { name: 'conn_duration_sec', value: 7200 }] },
  { id: '018e1234-0000-7000-8000-000000000024', organizationId: ORG, deviceId: '018e1234-0000-7000-8000-000000000011', detectedAt: '2026-04-29T00:00:00Z', severity: 'medium', status: 'open', attackLabel: 'lateral_movement', mitreTechnique: 'T1021', sourceIp: '10.0.0.5', destinationIp: '10.0.0.20', anomalyScore: 0.73, narrative: null, topFeatures: [{ name: 'smb_connection_count', value: 47 }, { name: 'unique_dst_hosts', value: 12 }] },
  { id: '018e1234-0000-7000-8000-000000000025', organizationId: ORG, deviceId: '018e1234-0000-7000-8000-000000000011', detectedAt: '2026-04-28T22:10:00Z', severity: 'medium', status: 'open', attackLabel: 'ddos', mitreTechnique: 'T1498', sourceIp: '198.51.100.0/28', destinationIp: '203.0.113.1', anomalyScore: 0.78, narrative: null, topFeatures: [{ name: 'packet_rate', value: 85000 }, { name: 'unique_src_ips', value: 15 }] },
  { id: '018e1234-0000-7000-8000-000000000026', organizationId: ORG, deviceId: DEV, detectedAt: '2026-04-28T20:55:00Z', severity: 'low', status: 'open', attackLabel: 'port_scan', mitreTechnique: 'T1046', sourceIp: '10.0.2.100', destinationIp: '10.0.0.1', anomalyScore: 0.52, narrative: null, topFeatures: [{ name: 'distinct_dst_ports', value: 22 }] },
  { id: '018e1234-0000-7000-8000-000000000027', organizationId: ORG, deviceId: DEV, detectedAt: '2026-04-28T18:00:00Z', severity: 'low', status: 'false_positive', attackLabel: 'port_scan', mitreTechnique: 'T1046', sourceIp: '10.0.0.200', destinationIp: '10.0.0.1', anomalyScore: 0.48, narrative: null, topFeatures: [{ name: 'distinct_dst_ports', value: 18 }] },
  { id: '018e1234-0000-7000-8000-000000000028', organizationId: ORG, deviceId: DEV, detectedAt: '2026-04-28T14:30:00Z', severity: 'info', status: 'open', attackLabel: 'unknown_anomaly', mitreTechnique: 'T1059', sourceIp: '10.0.1.10', destinationIp: '8.8.8.8', anomalyScore: 0.35, narrative: null, topFeatures: [{ name: 'query_rate', value: 320 }] },
];

let devices = [
  { id: '018e1234-0000-7000-8000-000000000010', organizationId: ORG, name: 'pfSense-Edge',    vendor: 'pfsense',   protocol: 'netflow', publicIp: '203.0.113.1', location: { lat: -37.8136, lng: 144.9631 }, lastSeenAt: '2026-04-29T04:58:00Z', createdAt: '2026-01-01T00:00:00Z' },
  { id: '018e1234-0000-7000-8000-000000000011', organizationId: ORG, name: 'MikroTik-Core',   vendor: 'mikrotik',  protocol: 'syslog',  publicIp: '203.0.113.2', location: { lat: -33.8688, lng: 151.2093 }, lastSeenAt: '2026-04-29T04:55:00Z', createdAt: '2026-01-15T00:00:00Z' },
  { id: '018e1234-0000-7000-8000-000000000012', organizationId: ORG, name: 'OPNsense-DMZ',    vendor: 'opnsense',  protocol: 'netflow', publicIp: '203.0.113.3', lastSeenAt: null,                           createdAt: '2026-02-10T00:00:00Z' },
  { id: '018e1234-0000-7000-8000-000000000013', organizationId: ORG, name: 'FortiGate-Branch', vendor: 'fortigate', protocol: 'syslog',  publicIp: '203.0.113.4', location: { lat: -27.4705, lng: 153.026  }, lastSeenAt: '2026-04-28T12:00:00Z', createdAt: '2026-03-01T00:00:00Z' },
];

let alertRules = [
  { id: '018e1234-0000-7000-8000-000000000030', organizationId: ORG, name: 'Critical incidents — email', minSeverity: 'critical', mitreFilter: [], channel: 'email', targetUserId: null, enabled: true,  createdAt: '2026-01-01T00:00:00Z' },
  { id: '018e1234-0000-7000-8000-000000000031', organizationId: ORG, name: 'High & above — SMS',         minSeverity: 'high',     mitreFilter: [], channel: 'sms',   targetUserId: null, enabled: true,  createdAt: '2026-01-15T00:00:00Z' },
  { id: '018e1234-0000-7000-8000-000000000032', organizationId: ORG, name: 'All anomalies — push',       minSeverity: 'info',     mitreFilter: [], channel: 'push',  targetUserId: null, enabled: false, createdAt: '2026-02-01T00:00:00Z' },
  { id: '018e1234-0000-7000-8000-000000000033', organizationId: ORG, name: 'C2 beaconing — email',       minSeverity: 'medium',   mitreFilter: ['T1071', 'T1095'], channel: 'email', targetUserId: null, enabled: true, createdAt: '2026-03-01T00:00:00Z' },
];

let idCounter = 50;
function nextId(): string {
  return `018e1234-0000-7000-8000-0000000000${String(++idCounter).padStart(2, '0')}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function noContent(res: ServerResponse): void {
  cors(res);
  res.writeHead(204);
  res.end();
}

function notFound(res: ServerResponse): void {
  json(res, { message: 'Not found' }, 404);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function paginate<T>(items: T[], qs: URLSearchParams): { items: T[]; page: number; pageSize: number; total: number } {
  const page = Math.max(1, parseInt(qs.get('page') ?? '1'));
  const pageSize = Math.max(1, parseInt(qs.get('pageSize') ?? '25'));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

// ── Router ────────────────────────────────────────────────────────────────────

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname.replace(BASE, '');
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  // Auth
  if (method === 'POST' && path === '/auth/login')   { json(res, mockAuth); return; }
  if (method === 'POST' && path === '/auth/register') { json(res, mockAuth, 201); return; }
  if (method === 'POST' && path === '/auth/refresh')  { json(res, mockAuth); return; }
  if (method === 'GET'  && path === '/auth/me')       { json(res, mockUser); return; }

  // Dashboard
  if (method === 'GET' && path === '/dashboard/kpis')       { json(res, kpis); return; }
  if (method === 'GET' && path === '/dashboard/threat-map') { json(res, threatMap); return; }

  // Incidents
  if (method === 'GET' && path === '/incidents') {
    let filtered = [...incidents];
    const sev = url.searchParams.get('severity');
    const sta = url.searchParams.get('status');
    if (sev) filtered = filtered.filter(i => i.severity === sev);
    if (sta) filtered = filtered.filter(i => i.status === sta);
    json(res, paginate(filtered, url.searchParams));
    return;
  }
  const incidentMatch = path.match(/^\/incidents\/([^/]+)$/);
  if (incidentMatch) {
    const id = incidentMatch[1];
    if (method === 'GET') {
      const inc = incidents.find(i => i.id === id);
      if (!inc) { notFound(res); return; }
      json(res, inc);
      return;
    }
    if (method === 'PATCH') {
      const idx = incidents.findIndex(i => i.id === id);
      if (idx === -1) { notFound(res); return; }
      const body = await readBody(req) as { status: string };
      incidents[idx] = { ...incidents[idx]!, status: body.status };
      json(res, incidents[idx]);
      return;
    }
  }

  // Devices
  if (method === 'GET' && path === '/devices') {
    json(res, paginate([...devices], url.searchParams));
    return;
  }
  if (method === 'POST' && path === '/devices') {
    const body = await readBody(req) as Record<string, unknown>;
    const device = { id: nextId(), organizationId: ORG, lastSeenAt: null, createdAt: new Date().toISOString(), ...body };
    devices.push(device as typeof devices[0]);
    json(res, { ...device, sharedSecret: 'nv-secret-shown-once-keep-safe' }, 201);
    return;
  }
  const deviceMatch = path.match(/^\/devices\/([^/]+)$/);
  if (deviceMatch) {
    const id = deviceMatch[1];
    if (method === 'GET') {
      const dev = devices.find(d => d.id === id);
      if (!dev) { notFound(res); return; }
      json(res, dev);
      return;
    }
    if (method === 'PATCH') {
      const idx = devices.findIndex(d => d.id === id);
      if (idx === -1) { notFound(res); return; }
      const body = await readBody(req) as Record<string, unknown>;
      devices[idx] = { ...devices[idx]!, ...body };
      json(res, devices[idx]);
      return;
    }
    if (method === 'DELETE') {
      devices = devices.filter(d => d.id !== id);
      noContent(res);
      return;
    }
  }

  // Alert rules
  if (method === 'GET' && path === '/alert-rules') {
    json(res, alertRules);
    return;
  }
  if (method === 'POST' && path === '/alert-rules') {
    const body = await readBody(req) as Record<string, unknown>;
    const rule = { id: nextId(), organizationId: ORG, createdAt: new Date().toISOString(), mitreFilter: [], targetUserId: null, ...body };
    alertRules.push(rule as typeof alertRules[0]);
    json(res, rule, 201);
    return;
  }
  const ruleMatch = path.match(/^\/alert-rules\/([^/]+)$/);
  if (ruleMatch) {
    const id = ruleMatch[1];
    if (method === 'PATCH') {
      const idx = alertRules.findIndex(r => r.id === id);
      if (idx === -1) { notFound(res); return; }
      const body = await readBody(req) as Record<string, unknown>;
      alertRules[idx] = { ...alertRules[idx]!, ...body };
      json(res, alertRules[idx]);
      return;
    }
    if (method === 'DELETE') {
      alertRules = alertRules.filter(r => r.id !== id);
      noContent(res);
      return;
    }
  }

  notFound(res);
}

// ── Start ─────────────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Internal server error' }));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock API running on http://0.0.0.0:${PORT}${BASE}`);
  console.log(`  Mobile devices should use: http://<YOUR_LAN_IP>:${PORT}${BASE}`);
});
