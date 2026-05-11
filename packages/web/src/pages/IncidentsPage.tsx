import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIncidentStream } from '../hooks/use-incident-stream.ts';
import { Link } from 'react-router-dom';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { usePermission } from '../lib/permissions.ts';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Spinner } from '../components/ui/Spinner.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import type { IncidentList, Incident, DeviceList, Severity, IncidentStatus } from '@netvigil/shared-types';

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

const ATTACK_LABEL_OPTIONS = [
  { value: 'port_scan',          label: 'Port scan'          },
  { value: 'ddos',               label: 'DDoS'               },
  { value: 'brute_force',        label: 'Brute force'        },
  { value: 'c2_beaconing',       label: 'C2 beaconing'       },
  { value: 'data_exfil',         label: 'Data exfiltration'  },
  { value: 'lateral_movement',   label: 'Lateral movement'   },
  { value: 'unknown_anomaly',    label: 'Unknown anomaly'    },
];

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZE = 10;

interface NewIncidentForm {
  deviceId: string;
  severity: string;
  attackLabel: string;
  mitreTechnique: string;
  sourceIp: string;
  destinationIp: string;
  anomalyScore: string;
  narrative: string;
}

const EMPTY_FORM: NewIncidentForm = {
  deviceId: '',
  severity: 'medium',
  attackLabel: 'unknown_anomaly',
  mitreTechnique: '',
  sourceIp: '',
  destinationIp: '',
  anomalyScore: '0.5',
  narrative: '',
};

interface NewIncidentModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function NewIncidentModal({ onClose, onCreated }: NewIncidentModalProps) {
  const [form, setForm]   = useState<NewIncidentForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const { data: deviceList } = useQuery({
    queryKey: qk.devices.list(1),
    queryFn: () => apiClient.get<DeviceList>('/devices?pageSize=100'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiClient.post<Incident>('/incidents', body),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (err: Error) => setError(err.message),
  });

  function set(field: keyof NewIncidentForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const score = parseFloat(form.anomalyScore);
    if (isNaN(score) || score < 0 || score > 1) {
      setError('Anomaly score must be a number between 0 and 1');
      return;
    }
    if (!form.deviceId) { setError('Please select a device'); return; }
    if (!form.mitreTechnique.trim()) { setError('MITRE technique is required'); return; }
    if (!form.sourceIp.trim()) { setError('Source IP is required'); return; }
    if (!form.destinationIp.trim()) { setError('Destination IP is required'); return; }

    mutation.mutate({
      deviceId:       form.deviceId,
      severity:       form.severity,
      attackLabel:    form.attackLabel,
      mitreTechnique: form.mitreTechnique,
      sourceIp:       form.sourceIp,
      destinationIp:  form.destinationIp,
      anomalyScore:   score,
      narrative:      form.narrative || undefined,
    });
  }

  const devices = deviceList?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">New Incident</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <Select
            label="Device"
            options={devices.map((d) => ({ value: d.id, label: `${d.name} (${d.publicIp})` }))}
            placeholder="Select device…"
            value={form.deviceId}
            onChange={set('deviceId')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Severity"
              options={SEVERITY_OPTIONS}
              value={form.severity}
              onChange={set('severity')}
            />
            <Select
              label="Attack type"
              options={ATTACK_LABEL_OPTIONS}
              value={form.attackLabel}
              onChange={set('attackLabel')}
            />
          </div>

          <Input
            label="MITRE technique"
            value={form.mitreTechnique}
            onChange={set('mitreTechnique')}
            placeholder="T1046"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Source IP"
              value={form.sourceIp}
              onChange={set('sourceIp')}
              placeholder="192.168.1.10"
            />
            <Input
              label="Destination IP"
              value={form.destinationIp}
              onChange={set('destinationIp')}
              placeholder="10.0.0.5"
            />
          </div>

          <Input
            label="Anomaly score (0–1)"
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={form.anomalyScore}
            onChange={set('anomalyScore')}
            className="max-w-xs"
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="narrative" className="text-sm font-medium text-slate-300">
              Narrative <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              id="narrative"
              rows={3}
              value={form.narrative}
              onChange={set('narrative')}
              placeholder="Brief description of the incident…"
              className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>

          {error && <ErrorAlert message={error} />}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>Create incident</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function IncidentsPage() {
  useIncidentStream();

  const queryClient = useQueryClient();
  const canWrite = usePermission('incidents:write');

  const [severity, setSeverity] = useState<Severity | ''>('');
  const [status,   setStatus]   = useState<IncidentStatus | ''>('');
  const [page,     setPage]     = useState(1);
  const [showCreate, setShowCreate] = useState(false);

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

  function handleCreated() {
    void queryClient.invalidateQueries({ queryKey: ['incidents', 'list'] });
    void queryClient.invalidateQueries({ queryKey: qk.dashboard.kpis() });
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Incidents</h1>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-sm text-slate-500">{data.total} total</span>
          )}
          {canWrite && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + New incident
            </Button>
          )}
        </div>
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

      {showCreate && (
        <NewIncidentModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
