import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Spinner } from '../components/ui/Spinner.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import type { DeviceList, DeviceCreate, DeviceVendor, DeviceProtocol } from '@netvigil/shared-types';

const VENDOR_OPTIONS: { value: DeviceVendor; label: string }[] = [
  { value: 'pfsense',       label: 'pfSense'         },
  { value: 'opnsense',      label: 'OPNsense'        },
  { value: 'mikrotik',      label: 'MikroTik'        },
  { value: 'fortigate',     label: 'FortiGate'       },
  { value: 'generic_syslog', label: 'Generic Syslog'  },
];

const PROTOCOL_OPTIONS: { value: DeviceProtocol; label: string }[] = [
  { value: 'syslog',  label: 'Syslog'   },
  { value: 'netflow', label: 'NetFlow'  },
  { value: 'pcap',    label: 'PCAP'     },
];

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

const createSchema = z.object({
  name:     z.string().min(1, 'Name is required').max(100),
  vendor:   z.enum(['pfsense', 'opnsense', 'mikrotik', 'fortigate', 'generic_syslog'] as const),
  protocol: z.enum(['syslog', 'netflow', 'pcap'] as const),
  publicIp: z.string().regex(IPV4_RE, 'Enter a valid IPv4 address'),
});

type FormErrors = Partial<Record<keyof z.infer<typeof createSchema>, string>>;

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [sharedSecret, setSharedSecret] = useState<string | null>(null);

  const [name,     setName]     = useState('');
  const [vendor,   setVendor]   = useState<DeviceVendor>('pfsense');
  const [protocol, setProtocol] = useState<DeviceProtocol>('netflow');
  const [publicIp, setPublicIp] = useState('');
  const [errors,   setErrors]   = useState<FormErrors>({});

  const { data, isLoading } = useQuery({
    queryKey: qk.devices.list(1),
    queryFn: () => apiClient.get<DeviceList>('/devices'),
  });

  const createMutation = useMutation({
    mutationFn: (body: DeviceCreate) =>
      apiClient.post<{ sharedSecret: string }>('/devices', body),
    onSuccess: (res) => {
      setSharedSecret(res.sharedSecret);
      setShowForm(false);
      setName(''); setPublicIp(''); setErrors({});
      void queryClient.invalidateQueries({ queryKey: qk.devices.list(1) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/devices/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.devices.list(1) });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const result = createSchema.safeParse({ name, vendor, protocol, publicIp });
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
    createMutation.mutate(result.data);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Devices</h1>
        <Button onClick={() => { setShowForm((v) => !v); setSharedSecret(null); }}>
          {showForm ? 'Cancel' : 'Register device'}
        </Button>
      </div>

      {/* Shared secret reveal */}
      {sharedSecret && (
        <Card className="border-emerald-700 bg-emerald-950">
          <p className="mb-2 text-sm font-semibold text-emerald-300">Device registered — copy your shared secret now</p>
          <p className="text-xs text-emerald-400 mb-3">This value is shown once and will not be retrievable again.</p>
          <code className="block rounded bg-slate-900 px-3 py-2 text-sm text-emerald-200 break-all">
            {sharedSecret}
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setSharedSecret(null)}
          >
            Dismiss
          </Button>
        </Card>
      )}

      {/* Registration form */}
      {showForm && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-300">New device</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <Input
              label="Device name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              placeholder="pfSense-Edge"
            />
            <Input
              label="Public IP"
              value={publicIp}
              onChange={(e) => setPublicIp(e.target.value)}
              error={errors.publicIp}
              placeholder="203.0.113.1"
            />
            <Select
              label="Vendor"
              options={VENDOR_OPTIONS}
              value={vendor}
              onChange={(e) => setVendor(e.target.value as DeviceVendor)}
            />
            <Select
              label="Protocol"
              options={PROTOCOL_OPTIONS}
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as DeviceProtocol)}
            />

            {createMutation.isError && (
              <div className="sm:col-span-2">
                <ErrorAlert message={(createMutation.error as Error).message} />
              </div>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" loading={createMutation.isPending}>
                Register
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Devices table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Vendor</th>
              <th className="px-4 py-3 text-left font-medium">Protocol</th>
              <th className="px-4 py-3 text-left font-medium">Public IP</th>
              <th className="px-4 py-3 text-left font-medium">Last seen</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3" />
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
                  No devices registered yet.
                </td>
              </tr>
            )}
            {data?.items.map((device) => {
              const isOnline =
                device.lastSeenAt !== null &&
                device.lastSeenAt !== undefined &&
                Date.now() - new Date(device.lastSeenAt).getTime() < 5 * 60 * 1000;

              return (
                <tr key={device.id} className="hover:bg-slate-700/30">
                  <td className="px-4 py-3 font-medium text-slate-200">{device.name}</td>
                  <td className="px-4 py-3 capitalize text-slate-400">{device.vendor.replace('_', ' ')}</td>
                  <td className="px-4 py-3 uppercase text-slate-400">{device.protocol}</td>
                  <td className="px-4 py-3 font-mono text-slate-300">{device.publicIp}</td>
                  <td className="px-4 py-3 text-slate-400">{formatLastSeen(device.lastSeenAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Remove ${device.name}?`)) {
                          deleteMutation.mutate(device.id);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
