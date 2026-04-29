import { http, HttpResponse } from 'msw';
import type { components } from '@netvigil/shared-types';

const BASE = 'http://localhost:8000/api/v1';

type Incident = components['schemas']['Incident'];
type IncidentStatus = components['schemas']['IncidentStatus'];

const ORG = '018e1234-0000-7000-8000-000000000000';
const DEV = '018e1234-0000-7000-8000-000000000010';

const SEED: Incident[] = [
  {
    id: '018e1234-0000-7000-8000-000000000020',
    organizationId: ORG,
    deviceId: DEV,
    detectedAt: '2026-04-29T04:12:00Z',
    severity: 'critical',
    status: 'open',
    attackLabel: 'c2_beaconing',
    mitreTechnique: 'T1071',
    sourceIp: '198.51.100.99',
    destinationIp: '10.0.0.5',
    anomalyScore: 0.97,
    narrative:
      'A host on the internal network is initiating periodic outbound connections to a known command-and-control infrastructure at 198.51.100.99. Beacon interval is approximately 60 seconds with a low jitter ratio, consistent with automated malware callback behaviour. Immediate isolation of the affected endpoint (10.0.0.5) is recommended.',
    topFeatures: [
      { name: 'beacon_interval_std', value: 1.3 },
      { name: 'packet_rate', value: 4500 },
      { name: 'bytes_per_packet', value: 92 },
    ],
  },
  {
    id: '018e1234-0000-7000-8000-000000000021',
    organizationId: ORG,
    deviceId: DEV,
    detectedAt: '2026-04-29T03:45:00Z',
    severity: 'high',
    status: 'open',
    attackLabel: 'port_scan',
    mitreTechnique: 'T1046',
    sourceIp: '203.0.113.77',
    destinationIp: '10.0.0.0/24',
    anomalyScore: 0.91,
    narrative:
      'An external IP (203.0.113.77) performed a SYN sweep across 254 hosts in the 10.0.0.0/24 subnet in under 2 seconds. This behaviour is characteristic of automated network reconnaissance and likely precedes a targeted exploitation attempt.',
    topFeatures: [
      { name: 'distinct_dst_ports', value: 254 },
      { name: 'syn_ratio', value: 0.99 },
      { name: 'flow_duration_ms', value: 1850 },
    ],
  },
  {
    id: '018e1234-0000-7000-8000-000000000022',
    organizationId: ORG,
    deviceId: DEV,
    detectedAt: '2026-04-29T02:30:00Z',
    severity: 'high',
    status: 'acknowledged',
    attackLabel: 'brute_force',
    mitreTechnique: 'T1110',
    sourceIp: '198.51.100.55',
    destinationIp: '10.0.0.22',
    anomalyScore: 0.88,
    narrative:
      'SSH service on 10.0.0.22 received 1,247 failed login attempts from a single source over 8 minutes. Rate exceeds 2.5 standard deviations above baseline for this host. Temporary firewall block has been applied by the on-call analyst.',
    topFeatures: [
      { name: 'auth_failures', value: 1247 },
      { name: 'unique_usernames', value: 38 },
      { name: 'attempt_rate_per_min', value: 155 },
    ],
  },
  {
    id: '018e1234-0000-7000-8000-000000000023',
    organizationId: ORG,
    deviceId: DEV,
    detectedAt: '2026-04-29T01:15:00Z',
    severity: 'critical',
    status: 'confirmed',
    attackLabel: 'data_exfil',
    mitreTechnique: 'T1048',
    sourceIp: '10.0.1.45',
    destinationIp: '185.220.101.34',
    anomalyScore: 0.95,
    narrative:
      'Internal workstation 10.0.1.45 transferred 4.7 GB to an external Tor exit node over the past 2 hours using DNS-over-HTTPS tunnelling. Volume and destination are significantly anomalous. Incident has been confirmed as a data exfiltration event.',
    topFeatures: [
      { name: 'upload_bytes', value: 4700000000 },
      { name: 'dns_query_entropy', value: 4.8 },
      { name: 'conn_duration_sec', value: 7200 },
    ],
  },
  {
    id: '018e1234-0000-7000-8000-000000000024',
    organizationId: ORG,
    deviceId: '018e1234-0000-7000-8000-000000000011',
    detectedAt: '2026-04-29T00:00:00Z',
    severity: 'medium',
    status: 'open',
    attackLabel: 'lateral_movement',
    mitreTechnique: 'T1021',
    sourceIp: '10.0.0.5',
    destinationIp: '10.0.0.20',
    anomalyScore: 0.73,
    narrative: null,
    topFeatures: [
      { name: 'smb_connection_count', value: 47 },
      { name: 'unique_dst_hosts', value: 12 },
    ],
  },
  {
    id: '018e1234-0000-7000-8000-000000000025',
    organizationId: ORG,
    deviceId: '018e1234-0000-7000-8000-000000000011',
    detectedAt: '2026-04-28T22:10:00Z',
    severity: 'medium',
    status: 'open',
    attackLabel: 'ddos',
    mitreTechnique: 'T1498',
    sourceIp: '198.51.100.0/28',
    destinationIp: '203.0.113.1',
    anomalyScore: 0.78,
    narrative: null,
    topFeatures: [
      { name: 'packet_rate', value: 85000 },
      { name: 'unique_src_ips', value: 15 },
    ],
  },
  {
    id: '018e1234-0000-7000-8000-000000000026',
    organizationId: ORG,
    deviceId: DEV,
    detectedAt: '2026-04-28T20:55:00Z',
    severity: 'low',
    status: 'open',
    attackLabel: 'port_scan',
    mitreTechnique: 'T1046',
    sourceIp: '10.0.2.100',
    destinationIp: '10.0.0.1',
    anomalyScore: 0.52,
    narrative: null,
    topFeatures: [{ name: 'distinct_dst_ports', value: 22 }],
  },
  {
    id: '018e1234-0000-7000-8000-000000000027',
    organizationId: ORG,
    deviceId: DEV,
    detectedAt: '2026-04-28T18:00:00Z',
    severity: 'low',
    status: 'false_positive',
    attackLabel: 'port_scan',
    mitreTechnique: 'T1046',
    sourceIp: '10.0.0.200',
    destinationIp: '10.0.0.1',
    anomalyScore: 0.48,
    narrative: null,
    topFeatures: [{ name: 'distinct_dst_ports', value: 18 }],
  },
  {
    id: '018e1234-0000-7000-8000-000000000028',
    organizationId: ORG,
    deviceId: DEV,
    detectedAt: '2026-04-28T14:30:00Z',
    severity: 'info',
    status: 'open',
    attackLabel: 'unknown_anomaly',
    mitreTechnique: 'T1059',
    sourceIp: '10.0.1.10',
    destinationIp: '8.8.8.8',
    anomalyScore: 0.35,
    narrative: null,
    topFeatures: [{ name: 'query_rate', value: 320 }],
  },
];

let store = [...SEED];

export const incidentHandlers = [
  http.get(`${BASE}/incidents`, ({ request }) => {
    const url = new URL(request.url);
    const severity = url.searchParams.get('severity');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '25');

    let filtered = store;
    if (severity) filtered = filtered.filter((i) => i.severity === severity);
    if (status) filtered = filtered.filter((i) => i.status === status);

    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      items: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      total: filtered.length,
    });
  }),

  http.get(`${BASE}/incidents/:incidentId`, ({ params }) => {
    const incident = store.find((i) => i.id === params['incidentId']);
    if (!incident) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(incident);
  }),

  http.patch(`${BASE}/incidents/:incidentId`, async ({ params, request }) => {
    const idx = store.findIndex((i) => i.id === params['incidentId']);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as { status: IncidentStatus; note?: string };
    store[idx] = { ...store[idx]!, status: body.status };
    return HttpResponse.json(store[idx]);
  }),
];
