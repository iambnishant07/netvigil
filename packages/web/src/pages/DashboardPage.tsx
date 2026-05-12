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
  Cell,
} from 'recharts';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { Card } from '../components/ui/Card.tsx';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge.tsx';
import { Spinner } from '../components/ui/Spinner.tsx';
import type { DashboardKpis, IncidentList } from '@aankhanet/shared-types';

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const SEVERITY_COLORS: Record<string, string> = {
  info:     '#64748b',
  low:      '#1d4ed8',
  medium:   '#ca8a04',
  high:     '#ea580c',
  critical: '#dc2626',
};

interface KpiTileProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

function KpiTile({ label, value, sub, accent = 'text-slate-100' }: KpiTileProps) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  useIncidentStream();

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: qk.dashboard.kpis(),
    queryFn: () => apiClient.get<DashboardKpis>('/dashboard/kpis'),
    refetchInterval: 10_000,
  });

  const { data: recentIncidents } = useQuery({
    queryKey: qk.incidents.list({ pageSize: 5 }),
    queryFn: () => apiClient.get<IncidentList>('/incidents?pageSize=5'),
    refetchInterval: 15_000,
  });

  const severityChartData = kpis
    ? (['critical', 'high', 'medium', 'low', 'info'] as const).map((s) => ({
        name:  s.charAt(0).toUpperCase() + s.slice(1),
        key:   s,
        count: kpis.openIncidentsBySeverity[s] ?? 0,
      }))
    : [];

  const totalOpen = severityChartData.reduce((a, d) => a + d.count, 0);
  const chartEmpty = severityChartData.every((d) => d.count === 0);

  if (kpisLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="Events / sec"
          value={kpis?.eventsPerSecond.toLocaleString('en-AU', { maximumFractionDigits: 0 }) ?? '—'}
          sub="live ingestion rate"
        />
        <KpiTile
          label="Critical open"
          value={kpis?.openIncidentsBySeverity.critical ?? 0}
          accent={kpis && kpis.openIncidentsBySeverity.critical > 0 ? 'text-red-400' : 'text-slate-100'}
        />
        <KpiTile
          label="High open"
          value={kpis?.openIncidentsBySeverity.high ?? 0}
          accent={kpis && kpis.openIncidentsBySeverity.high > 0 ? 'text-orange-400' : 'text-slate-100'}
        />
        <KpiTile
          label="Medium open"
          value={kpis?.openIncidentsBySeverity.medium ?? 0}
          accent={kpis && kpis.openIncidentsBySeverity.medium > 0 ? 'text-yellow-400' : 'text-slate-100'}
        />
        <KpiTile
          label="Total open"
          value={totalOpen}
          sub="all severities"
        />
      </div>

      {/* Chart + recent incidents */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Severity breakdown chart */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Open incidents by severity</h2>
          {chartEmpty ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-slate-500">
              No open incidents
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={severityChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#cbd5e1' }}
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {severityChartData.map((entry) => (
                    <Cell key={entry.key} fill={SEVERITY_COLORS[entry.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Recent incidents */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Recent incidents</h2>
            <Link to="/incidents" className="text-xs text-indigo-400 hover:text-indigo-300">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {recentIncidents?.items.slice(0, 5).map((inc) => (
              <Link
                key={inc.id}
                to={`/incidents/${inc.id}`}
                className="flex items-center gap-3 rounded-md p-2 hover:bg-slate-700 transition-colors"
              >
                <SeverityBadge value={inc.severity} />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-slate-200">
                    {inc.attackLabel.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-slate-500">{formatTs(inc.detectedAt)}</p>
                </div>
                <StatusBadge value={inc.status} />
              </Link>
            ))}
            {(!recentIncidents || recentIncidents.items.length === 0) && (
              <p className="text-sm text-slate-500 py-4 text-center">No incidents</p>
            )}
          </div>
        </Card>
      </div>

      {/* Top talkers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Top internal talkers</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">IP Address</th>
                <th className="pb-2 font-medium text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {kpis?.topInternalTalkers.map((t) => (
                <tr key={t.ip}>
                  <td className="py-2 font-mono text-slate-300">{t.ip}</td>
                  <td className="py-2 text-right text-slate-400">{formatBytes(t.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Top external destinations</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">IP Address</th>
                <th className="pb-2 font-medium">Country</th>
                <th className="pb-2 font-medium text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {kpis?.topExternalDestinations.map((d) => (
                <tr key={d.ip}>
                  <td className="py-2 font-mono text-slate-300">{d.ip}</td>
                  <td className="py-2 text-slate-400">{d.country}</td>
                  <td className="py-2 text-right text-slate-400">{formatBytes(d.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
