import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Spinner } from '../components/ui/Spinner.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import type { Incident, IncidentStatus, Severity } from '@netvigil/shared-types';

const STATUS_OPTIONS = [
  { value: 'open',           label: 'Open'           },
  { value: 'acknowledged',   label: 'Acknowledged'   },
  { value: 'confirmed',      label: 'Confirmed'      },
  { value: 'false_positive', label: 'False positive' },
];

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High'     },
  { value: 'medium',   label: 'Medium'   },
  { value: 'low',      label: 'Low'      },
  { value: 'info',     label: 'Info'     },
];

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short',
  });
}

interface DetailRowProps { label: string; value: React.ReactNode; }
function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-200">{value}</dd>
    </div>
  );
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: incident, isLoading, isError } = useQuery({
    queryKey: qk.incidents.detail(id ?? ''),
    queryFn: () => apiClient.get<Incident>(`/incidents/${id}`),
    enabled: id !== undefined,
  });

  const [selectedStatus,   setSelectedStatus]   = useState<IncidentStatus | ''>('');
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | ''>('');
  const [editedNarrative,  setEditedNarrative]  = useState('');

  useEffect(() => {
    if (incident) {
      setSelectedStatus(incident.status as IncidentStatus);
      setSelectedSeverity(incident.severity as Severity);
      setEditedNarrative(incident.narrative ?? '');
    }
  }, [incident]);

  const updateMutation = useMutation({
    mutationFn: (body: { status?: IncidentStatus; severity?: Severity; narrative?: string }) =>
      apiClient.patch<Incident>(`/incidents/${id}`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.incidents.detail(id ?? ''), updated);
    },
  });

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!incident) return;
    const body: Record<string, string> = {};
    if (selectedStatus   && selectedStatus   !== incident.status)   body.status    = selectedStatus;
    if (selectedSeverity && selectedSeverity !== incident.severity) body.severity  = selectedSeverity;
    if (editedNarrative  !== (incident.narrative ?? ''))            body.narrative = editedNarrative;
    if (Object.keys(body).length === 0) return;
    updateMutation.mutate(body as Parameters<typeof updateMutation.mutate>[0]);
  }

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

  if (isError || !incident) {
    return (
      <div className="space-y-4">
        <Link to="/incidents" className="text-sm text-indigo-400 hover:text-indigo-300">← Back to incidents</Link>
        <ErrorAlert message="Incident not found or failed to load." />
      </div>
    );
  }

  const isDirty =
    selectedStatus   !== incident.status ||
    selectedSeverity !== incident.severity ||
    editedNarrative  !== (incident.narrative ?? '');

  return (
    <div className="space-y-6">
      <Link to="/incidents" className="text-sm text-indigo-400 hover:text-indigo-300">← Back to incidents</Link>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <SeverityBadge value={incident.severity} />
        <h1 className="text-xl font-semibold text-slate-100 capitalize">
          {incident.attackLabel.replace(/_/g, ' ')}
        </h1>
        <code className="rounded bg-slate-700 px-2 py-0.5 text-sm text-indigo-300">{incident.mitreTechnique}</code>
        <div className="ml-auto"><StatusBadge value={incident.status} /></div>
      </div>

      {/* Detail grid */}
      <Card>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailRow label="Detected at" value={formatTs(incident.detectedAt)} />
          <DetailRow label="Source IP"   value={<span className="font-mono">{incident.sourceIp}</span>} />
          <DetailRow label="Destination IP" value={<span className="font-mono">{incident.destinationIp}</span>} />
          <DetailRow label="Device ID"   value={<span className="font-mono text-xs">{incident.deviceId}</span>} />
          <DetailRow label="MITRE technique" value={
            <a
              href={`https://attack.mitre.org/techniques/${incident.mitreTechnique.replace('.', '/')}`}
              target="_blank" rel="noreferrer"
              className="text-indigo-400 hover:text-indigo-300 font-mono"
            >
              {incident.mitreTechnique} ↗
            </a>
          } />
          <DetailRow label="Anomaly score" value={
            <div className="flex items-center gap-2">
              <div className="h-2 w-32 rounded-full bg-slate-700">
                <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${incident.anomalyScore * 100}%` }} />
              </div>
              <span className="tabular-nums">{(incident.anomalyScore * 100).toFixed(1)}%</span>
            </div>
          } />
        </dl>
      </Card>

      {/* Top features */}
      {incident.topFeatures && incident.topFeatures.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Top contributing features</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Feature</th>
                <th className="pb-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {incident.topFeatures.map((f) => (
                <tr key={f.name}>
                  <td className="py-2 font-mono text-slate-300">{f.name}</td>
                  <td className="py-2 text-right text-slate-400 tabular-nums">{f.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* AI narrative */}
      {incident.narrative && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-300">AI Narrative</h2>
          <p className="text-sm leading-relaxed text-slate-300">{incident.narrative}</p>
        </Card>
      )}

      {/* Edit form */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Update status</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as IncidentStatus)}
            />
            <Select
              label="Severity"
              options={SEVERITY_OPTIONS}
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value as Severity)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="narrative" className="text-sm font-medium text-slate-300">
              Narrative / analyst note
            </label>
            <textarea
              id="narrative"
              rows={4}
              maxLength={4000}
              placeholder="Describe what happened and recommended action…"
              value={editedNarrative}
              onChange={(e) => setEditedNarrative(e.target.value)}
              className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
            />
          </div>
          {updateMutation.isError && <ErrorAlert message={(updateMutation.error as Error).message} />}
          {updateMutation.isSuccess && <p className="text-sm text-green-400">Saved.</p>}
          <Button type="submit" loading={updateMutation.isPending} disabled={!isDirty}>
            Save status
          </Button>
        </form>
      </Card>
    </div>
  );
}
