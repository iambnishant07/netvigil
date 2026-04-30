import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIncidentStream } from '../hooks/use-incident-stream.ts';
import { Link } from 'react-router-dom';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Spinner } from '../components/ui/Spinner.tsx';
import type { IncidentList, Severity, IncidentStatus } from '@netvigil/shared-types';

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High'     },
  { value: 'medium',   label: 'Medium'   },
  { value: 'low',      label: 'Low'      },
  { value: 'info',     label: 'Info'     },
];

const STATUS_OPTIONS = [
  { value: 'open',           label: 'Open'           },
  { value: 'acknowledged',   label: 'Acknowledged'   },
  { value: 'confirmed',      label: 'Confirmed'      },
  { value: 'false_positive', label: 'False positive' },
];

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZE = 10;

export default function IncidentsPage() {
  useIncidentStream();

  const [severity, setSeverity] = useState<Severity | ''>('');
  const [status,   setStatus]   = useState<IncidentStatus | ''>('');
  const [page,     setPage]     = useState(1);

  const filters = { severity, status, page, pageSize: PAGE_SIZE };

  const { data, isLoading } = useQuery({
    queryKey: qk.incidents.list(filters),
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (severity) p.set('severity', severity);
      if (status)   p.set('status', status);
      return apiClient.get<IncidentList>(`/incidents?${p.toString()}`);
    },
  });

  function resetFilters() {
    setSeverity('');
    setStatus('');
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Incidents</h1>
        {data && (
          <span className="text-sm text-slate-500">{data.total} total</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Select
          placeholder="All severities"
          options={SEVERITY_OPTIONS}
          value={severity}
          onChange={(e) => { setSeverity(e.target.value as Severity | ''); setPage(1); }}
        />
        <Select
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => { setStatus(e.target.value as IncidentStatus | ''); setPage(1); }}
        />
        {(severity || status) && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Detected</th>
              <th className="px-4 py-3 text-left font-medium">Severity</th>
              <th className="px-4 py-3 text-left font-medium">Attack type</th>
              <th className="px-4 py-3 text-left font-medium">MITRE</th>
              <th className="px-4 py-3 text-left font-medium">Source → Dest</th>
              <th className="px-4 py-3 text-left font-medium">Score</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 bg-slate-800/50">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <Spinner />
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No incidents match the current filters.
                </td>
              </tr>
            )}
            {data?.items.map((inc) => (
              <tr
                key={inc.id}
                className="hover:bg-slate-700/40 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                  <Link to={`/incidents/${inc.id}`} className="block">
                    {formatTs(inc.detectedAt)}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/incidents/${inc.id}`} className="block">
                    <SeverityBadge value={inc.severity} />
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-300 capitalize">
                  <Link to={`/incidents/${inc.id}`} className="block">
                    {inc.attackLabel.replace(/_/g, ' ')}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/incidents/${inc.id}`} className="block">
                    <code className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-indigo-300">
                      {inc.mitreTechnique}
                    </code>
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  <Link to={`/incidents/${inc.id}`} className="block">
                    {inc.sourceIp} → {inc.destinationIp}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/incidents/${inc.id}`} className="block">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-slate-700">
                        <div
                          className="h-1.5 rounded-full bg-indigo-500"
                          style={{ width: `${inc.anomalyScore * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">
                        {(inc.anomalyScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/incidents/${inc.id}`} className="block">
                    <StatusBadge value={inc.status} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
