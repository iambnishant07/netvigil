import './DashboardPage.css';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useIncidentStream } from '../hooks/use-incident-stream.ts';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge.tsx';
import { Spinner } from '../components/ui/Spinner.tsx';
import type { DashboardKpis, IncidentList } from '@aankhanet/shared-types';

// ─── inline types ─────────────────────────────────────────────────────────────

interface ThreatArc {
  from: { lat: number; lng: number };
  to:   { lat: number; lng: number };
  count: number;
  severity: string;
  sourceCountry: string;
}
interface ThreatMapData {
  center: { lat: number; lng: number };
  arcs: ThreatArc[];
}
interface TrendDay {
  date: string;
  critical: number; high: number; medium: number; low: number; info: number;
}
interface TrendData { days: TrendDay[] }
interface AttackTypesData {
  c2_beaconing: number; brute_force: number; ddos: number;
  port_scan: number; data_exfil: number; lateral_movement: number; unknown_anomaly: number;
}

// ─── theme maps — Tailwind classes only ──────────────────────────────────────

// Text-colour class per severity (exact Tailwind v3 defaults match our hex palette)
const SEV_TXT: Record<string, string> = {
  critical: 'text-red-500',
  high:     'text-orange-500',
  medium:   'text-yellow-500',
  low:      'text-green-500',
  info:     'text-blue-500',
};

// Hex values still needed for SVG fill/stroke attributes (not style props)
const SEV_HEX: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', info: '#3b82f6',
};

const ARC_HEX: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
};

// Tailwind class pairs for each AttackBox variant
const ATTACK_CLS: Record<string, { text: string; border: string }> = {
  c2:      { text: 'text-red-500',    border: 'border-t-red-500' },
  brute:   { text: 'text-orange-500', border: 'border-t-orange-500' },
  ddos:    { text: 'text-yellow-500', border: 'border-t-yellow-500' },
  scan:    { text: 'text-blue-500',   border: 'border-t-blue-500' },
  exfil:   { text: 'text-purple-500', border: 'border-t-purple-500' },
  lateral: { text: 'text-orange-400', border: 'border-t-orange-400' },
  unknown: { text: 'text-slate-500',  border: 'border-t-slate-500' },
};

// Panel Tailwind class reused everywhere
const P = 'bg-navy-panel border border-navy-border rounded-lg p-4';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function geo(lng: number, lat: number): [number, number] {
  return [((lng + 180) / 360) * 700, ((90 - lat) / 180) * 320];
}

function arcPath(sLng: number, sLat: number, eLng: number, eLat: number): string {
  const [sx, sy] = geo(sLng, sLat);
  const [ex, ey] = geo(eLng, eLat);
  const mx = (sx + ex) / 2;
  const my = Math.min(sy, ey) - 55;
  return `M ${sx.toFixed(1)},${sy.toFixed(1)} Q ${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
}

// ─── RiskDonut ────────────────────────────────────────────────────────────────

function riskColorCls(score: number): string {
  if (score >= 70) return 'text-red-500';
  if (score >= 40) return 'text-orange-500';
  if (score >= 20) return 'text-yellow-500';
  return 'text-green-500';
}

function riskHex(score: number): string {
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#f97316';
  if (score >= 20) return '#eab308';
  return '#22c55e';
}

function RiskDonut({ kpis }: { kpis: DashboardKpis }) {
  const { critical = 0, high = 0, medium = 0, low = 0 } = kpis.openIncidentsBySeverity;
  const score  = Math.min(100, critical * 10 + high * 5 + medium * 2 + low);
  const r      = 52, cx = 70, cy = 70;
  const circ   = 2 * Math.PI * r;
  const dash   = (score / 100) * circ;
  const hex    = riskHex(score);
  const label  = score >= 70 ? 'HIGH RISK' : score >= 40 ? 'ELEVATED' : score >= 20 ? 'MODERATE' : 'LOW RISK';

  return (
    <div className="flex flex-col items-center gap-1">
      {/* SVG attributes (fill/stroke) are not style props — no linting concern */}
      <svg width={140} height={140} viewBox="0 0 140 140" aria-label={`Risk score ${score}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0d3050" strokeWidth={14} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={hex} strokeWidth={14}
          strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
          strokeLinecap="round" transform="rotate(-90 70 70)"
        />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={26} fontWeight="bold" fill={hex}>
          {score}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill="#64748b">RISK SCORE</text>
      </svg>
      <p className={`text-xs font-bold tracking-widest ${riskColorCls(score)}`}>{label}</p>
    </div>
  );
}

// ─── WorldThreatMap ───────────────────────────────────────────────────────────

const CONTINENTS: Array<{ id: string; d: string }> = [
  { id: 'na', d: 'M 25,38 L 60,28 L 115,30 L 195,48 L 225,72 L 218,100 L 194,118 L 168,130 L 140,125 L 108,118 L 58,105 L 28,80 Z' },
  { id: 'sa', d: 'M 148,128 L 190,118 L 245,135 L 280,165 L 270,196 L 235,222 L 214,254 L 200,222 L 198,172 Z' },
  { id: 'eu', d: 'M 330,58 L 360,52 L 400,55 L 418,68 L 398,88 L 370,93 L 340,88 L 328,75 Z' },
  { id: 'af', d: 'M 328,92 L 365,82 L 412,88 L 438,105 L 448,142 L 420,202 L 378,218 L 342,208 L 310,172 L 308,138 L 325,118 Z' },
  { id: 'as', d: 'M 415,58 L 460,42 L 530,35 L 602,40 L 665,58 L 688,82 L 658,112 L 598,132 L 545,152 L 480,158 L 440,142 L 416,122 L 410,90 Z' },
  { id: 'au', d: 'M 576,218 L 606,183 L 634,180 L 648,210 L 638,228 L 620,222 L 576,218 Z' },
  { id: 'nz', d: 'M 680,214 L 690,225 L 685,238 L 678,232 Z' },
];

function WorldThreatMap({ threatMap }: { threatMap: ThreatMapData | undefined }) {
  const center = threatMap?.center ?? { lat: -33.87, lng: 151.21 };
  const arcs   = threatMap?.arcs   ?? [];
  const [cx, cy] = geo(center.lng, center.lat);

  return (
    <div className={`${P} p-3`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Global Threat Map
      </p>
      <div className="w-full aspect-[700/320]">
        <svg
          viewBox="0 0 700 320"
          className="w-full h-full rounded-sm bg-navy-map"
          aria-label="World threat map"
        >
          <defs>
            <style>{`
              @keyframes arcDraw { from { stroke-dashoffset: 500 } to { stroke-dashoffset: 0 } }
              .t-arc { stroke-dasharray: 500; animation: arcDraw 2s ease-in-out forwards; }
              @keyframes homePulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
              .home-dot { animation: homePulse 2s infinite; }
            `}</style>
            <radialGradient id="rg" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#00c8e0" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00c8e0" stopOpacity="0" />
            </radialGradient>
          </defs>

          {[-60, -30, 0, 30, 60].map((lat) => {
            const [, y] = geo(0, lat);
            return <line key={`lat${lat}`} x1={0} y1={y} x2={700} y2={y} stroke="#0d2540" strokeWidth={0.5} />;
          })}
          {[-120, -60, 0, 60, 120].map((lng) => {
            const [x] = geo(lng, 0);
            return <line key={`lng${lng}`} x1={x} y1={0} x2={x} y2={320} stroke="#0d2540" strokeWidth={0.5} />;
          })}

          {CONTINENTS.map((c) => (
            <path key={c.id} d={c.d} fill="#0a2240" stroke="#1a4060" strokeWidth={0.8} />
          ))}

          {arcs.map((arc, i) => {
            const d     = arcPath(arc.from.lng, arc.from.lat, arc.to.lng, arc.to.lat);
            const color = ARC_HEX[arc.severity] ?? '#94a3b8';
            const [fx, fy] = geo(arc.from.lng, arc.from.lat);
            return (
              <g key={i}>
                <path
                  d={d} fill="none" stroke={color} strokeWidth={1.5} opacity={0.85}
                  className={`t-arc arc-d-${i}`}
                />
                <circle cx={fx} cy={fy} r={3} fill={color} opacity={0.9} />
              </g>
            );
          })}

          <circle cx={cx} cy={cy} r={22} fill="url(#rg)" />
          <circle cx={cx} cy={cy} r={5} fill="#00c8e0" className="home-dot" />
        </svg>
      </div>
    </div>
  );
}

// ─── AttackBox ────────────────────────────────────────────────────────────────

interface AttackBoxProps {
  label: string;
  count: number;
  variant: keyof typeof ATTACK_CLS;
}

function AttackBox({ label, count, variant }: AttackBoxProps) {
  const { text, border } = ATTACK_CLS[variant];
  return (
    <div className={`bg-navy-panel border border-navy-border rounded-lg p-3 flex flex-col gap-1 min-w-0 border-t-2 ${border}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide truncate ${text}`}>
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums text-white">{count.toLocaleString()}</p>
    </div>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  useIncidentStream();

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: qk.dashboard.kpis(),
    queryFn:  () => apiClient.get<DashboardKpis>('/dashboard/kpis'),
    refetchInterval: 10_000,
  });

  const { data: threatMap } = useQuery({
    queryKey: qk.dashboard.threatMap(24),
    queryFn:  () => apiClient.get<ThreatMapData>('/dashboard/threat-map?hours=24'),
    refetchInterval: 30_000,
  });

  const { data: trendData } = useQuery({
    queryKey: qk.dashboard.trend(),
    queryFn:  () => apiClient.get<TrendData>('/dashboard/trend'),
    refetchInterval: 60_000,
  });

  const { data: attackTypes } = useQuery({
    queryKey: qk.dashboard.attackTypes(),
    queryFn:  () => apiClient.get<AttackTypesData>('/dashboard/attack-types'),
    refetchInterval: 30_000,
  });

  const { data: recentIncidents } = useQuery({
    queryKey: qk.incidents.list({ pageSize: 10 }),
    queryFn:  () => apiClient.get<IncidentList>('/incidents?pageSize=10'),
    refetchInterval: 15_000,
  });

  if (kpisLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const trendDays = (trendData?.days ?? []).map((d) => ({ ...d, label: d.date.slice(5) }));
  const totalOpen = kpis
    ? Object.values(kpis.openIncidentsBySeverity).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-4 bg-navy-bg min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wide text-navy-accent">Risk Monitor</h1>
        <p className="text-xs text-slate-500">
          {new Date().toLocaleString('en-AU', {
            weekday: 'short', day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>

      {/* Row 1: Risk Score | World Map | Top Internal Talkers */}
      <div className="grid grid-cols-[2fr_7fr_3fr] gap-4">
        <div className={`${P} flex flex-col items-center gap-3`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 self-start">
            Risk Score
          </p>
          {kpis && <RiskDonut kpis={kpis} />}
          <div className="w-full space-y-1 mt-1">
            {(['critical', 'high', 'medium', 'low', 'info'] as const).map((s) => (
              <div key={s} className="flex justify-between text-xs">
                <span className={`capitalize ${SEV_TXT[s]}`}>{s}</span>
                <span className="font-mono text-slate-300">
                  {kpis?.openIncidentsBySeverity[s] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>

        <WorldThreatMap threatMap={threatMap} />

        <div className={P}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Top Internal Talkers
          </p>
          <div className="space-y-2">
            {kpis?.topInternalTalkers.map((t, i) => (
              <div key={t.ip} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">#{i + 1}</span>
                  <span className="font-mono text-slate-300">{t.ip}</span>
                </div>
                <span className="text-slate-400">{formatBytes(t.bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Attack Type Boxes */}
      <div className="grid grid-cols-7 gap-3">
        <AttackBox label="C&C Beaconing" count={attackTypes?.c2_beaconing    ?? 0} variant="c2" />
        <AttackBox label="Brute Force"   count={attackTypes?.brute_force      ?? 0} variant="brute" />
        <AttackBox label="DDoS"          count={attackTypes?.ddos             ?? 0} variant="ddos" />
        <AttackBox label="Port Scan"     count={attackTypes?.port_scan        ?? 0} variant="scan" />
        <AttackBox label="Data Exfil"    count={attackTypes?.data_exfil       ?? 0} variant="exfil" />
        <AttackBox label="Lateral Move"  count={attackTypes?.lateral_movement ?? 0} variant="lateral" />
        <AttackBox label="Unknown"       count={attackTypes?.unknown_anomaly  ?? 0} variant="unknown" />
      </div>

      {/* Row 3: Trend | Top External Destinations | Live Stats */}
      <div className="grid grid-cols-[5fr_4fr_3fr] gap-4">
        <div className={P}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            7-Day Threat Trend
          </p>
          {trendDays.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendDays} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false} tickLine={false} allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ background: '#061525', border: '1px solid #0d3050', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#cbd5e1' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 10, color: '#64748b' }} />
                {(['info', 'low', 'medium', 'high', 'critical'] as const).map((s) => (
                  <Bar key={s} dataKey={s} stackId="a" fill={SEV_HEX[s]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-slate-600">
              No trend data
            </div>
          )}
        </div>

        <div className={P}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Top External Destinations
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-navy-border">
                <th className="pb-2 font-medium text-slate-600">IP / Country</th>
                <th className="pb-2 font-medium text-right text-slate-600">Volume</th>
              </tr>
            </thead>
            <tbody>
              {kpis?.topExternalDestinations.map((d) => (
                <tr key={d.ip} className="border-b border-navy-border/50">
                  <td className="py-1.5">
                    <span className="font-mono text-slate-300">{d.ip}</span>
                    <span className="ml-2 text-slate-600">{d.country}</span>
                  </td>
                  <td className="py-1.5 text-right text-slate-400">{formatBytes(d.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`${P} flex flex-col gap-4`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Live Stats</p>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500">Events / sec</p>
              <p className="text-2xl font-bold tabular-nums text-navy-accent">
                {kpis?.eventsPerSecond.toLocaleString('en-AU', { maximumFractionDigits: 0 }) ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total open incidents</p>
              <p className="text-2xl font-bold tabular-nums text-white">{totalOpen}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Active threat arcs</p>
              <p className="text-2xl font-bold tabular-nums text-orange-400">
                {threatMap?.arcs.length ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Threat Feed */}
      <div className={P}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Threat Feed</p>
          <Link to="/incidents" className="text-xs text-navy-accent hover:opacity-80">
            View all →
          </Link>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b border-navy-border">
              <th className="pb-2 font-medium text-slate-600">Severity</th>
              <th className="pb-2 font-medium text-slate-600">Attack</th>
              <th className="pb-2 font-medium text-slate-600">Status</th>
              <th className="pb-2 font-medium text-right text-slate-600">Detected</th>
            </tr>
          </thead>
          <tbody>
            {recentIncidents?.items.slice(0, 8).map((inc) => (
              <tr
                key={inc.id}
                className="border-b border-navy-border/50 hover:bg-slate-800/30 transition-colors"
              >
                <td className="py-1.5"><SeverityBadge value={inc.severity} /></td>
                <td className="py-1.5 text-slate-300 font-medium">
                  <Link to={`/incidents/${inc.id}`} className="hover:text-white">
                    {inc.attackLabel.replace(/_/g, ' ')}
                  </Link>
                </td>
                <td className="py-1.5"><StatusBadge value={inc.status} /></td>
                <td className="py-1.5 text-right text-slate-500">{formatTs(inc.detectedAt)}</td>
              </tr>
            ))}
            {(!recentIncidents || recentIncidents.items.length === 0) && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-600">No threats detected</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
