import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { Spinner } from '../components/ui/Spinner.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';

interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function ActionBadge({ action }: { action: string }) {
  const color = action.includes('delete') || action.includes('disable')
    ? 'text-red-400 bg-red-400/10'
    : action.includes('create') || action.includes('enable')
    ? 'text-emerald-400 bg-emerald-400/10'
    : 'text-indigo-400 bg-indigo-400/10';
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-mono font-medium ${color}`}>
      {action}
    </span>
  );
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);

  const { data: logs, isLoading, error } = useQuery({
    queryKey: qk.auditLogs.list(page),
    queryFn: () => apiClient.get<AuditLog[]>(`/audit-logs?page=${page}&pageSize=50`),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load audit logs'} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Audit Log</h1>
        <p className="text-sm text-slate-400 mt-0.5">Immutable record of all privileged actions</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Actor</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Target</th>
              <th className="px-4 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {(logs ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                  No audit log entries yet
                </td>
              </tr>
            )}
            {(logs ?? []).map((log) => (
              <tr key={log.id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('en-AU', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3 text-slate-200 font-medium text-xs">{log.actorEmail}</td>
                <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                  {log.targetId ? log.targetId.slice(0, 8) + '…' : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                  {Object.keys(log.metadata).length > 0
                    ? JSON.stringify(log.metadata)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="text-sm text-slate-400 hover:text-slate-200 disabled:opacity-40"
        >
          ← Previous
        </button>
        <span className="text-xs text-slate-500">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={(logs ?? []).length < 50}
          className="text-sm text-slate-400 hover:text-slate-200 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
