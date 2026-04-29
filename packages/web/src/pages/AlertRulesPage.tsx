import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { SeverityBadge } from '../components/ui/Badge.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Spinner } from '../components/ui/Spinner.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import type { AlertRule, AlertRuleCreate, Severity, AlertChannel } from '@netvigil/shared-types';

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High'     },
  { value: 'medium',   label: 'Medium'   },
  { value: 'low',      label: 'Low'      },
  { value: 'info',     label: 'Info'     },
];

const CHANNEL_OPTIONS: { value: AlertChannel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'sms',   label: 'SMS'   },
  { value: 'push',  label: 'Push'  },
];

const createSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(100),
  minSeverity: z.enum(['critical', 'high', 'medium', 'low', 'info'] as const),
  channel:     z.enum(['email', 'sms', 'push'] as const),
});

type FormErrors = Partial<Record<keyof z.infer<typeof createSchema>, string>>;

const CHANNEL_ICON: Record<AlertChannel, string> = {
  email: '✉',
  sms:   '📱',
  push:  '🔔',
};

export default function AlertRulesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const [name,        setName]        = useState('');
  const [minSeverity, setMinSeverity] = useState<Severity>('high');
  const [channel,     setChannel]     = useState<AlertChannel>('email');
  const [errors,      setErrors]      = useState<FormErrors>({});

  const { data: rules, isLoading } = useQuery({
    queryKey: qk.alertRules.list(),
    queryFn: () => apiClient.get<AlertRule[]>('/alert-rules'),
  });

  const createMutation = useMutation({
    mutationFn: (body: AlertRuleCreate) =>
      apiClient.post<AlertRule>('/alert-rules', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.alertRules.list() });
      setShowForm(false);
      setName('');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.patch<AlertRule>(`/alert-rules/${id}`, { enabled }),
    onSuccess: (updated) => {
      queryClient.setQueryData<AlertRule[]>(qk.alertRules.list(), (prev) =>
        prev?.map((r) => (r.id === updated.id ? updated : r)),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/alert-rules/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.alertRules.list() });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const result = createSchema.safeParse({ name, minSeverity, channel });
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    createMutation.mutate({ ...result.data, enabled: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Alert Rules</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Create rule'}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-300">New alert rule</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-3" noValidate>
            <Input
              label="Rule name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              placeholder="High severity to email"
              className="sm:col-span-3"
            />
            <Select
              label="Minimum severity"
              options={SEVERITY_OPTIONS}
              value={minSeverity}
              onChange={(e) => setMinSeverity(e.target.value as Severity)}
            />
            <Select
              label="Channel"
              options={CHANNEL_OPTIONS}
              value={channel}
              onChange={(e) => setChannel(e.target.value as AlertChannel)}
            />

            {createMutation.isError && (
              <div className="sm:col-span-3">
                <ErrorAlert message={(createMutation.error as Error).message} />
              </div>
            )}

            <div className="sm:col-span-3">
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Rules list */}
      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}

      {!isLoading && rules?.length === 0 && (
        <p className="text-center text-slate-500 py-10">No alert rules yet. Create one above.</p>
      )}

      <div className="space-y-3">
        {rules?.map((rule) => (
          <Card key={rule.id} className={`flex flex-wrap items-center gap-4 ${!rule.enabled ? 'opacity-60' : ''}`}>
            {/* Channel icon */}
            <span className="text-lg" aria-hidden="true">{CHANNEL_ICON[rule.channel]}</span>

            {/* Name + badges */}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium text-slate-200">{rule.name}</p>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge value={rule.minSeverity} />
                <span className="text-xs text-slate-500">and above</span>
                <span className="text-xs uppercase text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded">
                  {rule.channel}
                </span>
                {rule.mitreFilter && rule.mitreFilter.length > 0 && (
                  <span className="text-xs text-slate-500">
                    MITRE filter: {rule.mitreFilter.join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Enable toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-slate-400">{rule.enabled ? 'Enabled' : 'Disabled'}</span>
              <button
                role="switch"
                aria-checked={rule.enabled}
                onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  rule.enabled ? 'bg-indigo-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    rule.enabled ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            {/* Delete */}
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm(`Delete "${rule.name}"?`)) {
                  deleteMutation.mutate(rule.id);
                }
              }}
            >
              Delete
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
