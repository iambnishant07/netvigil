import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { usePermission, useRole } from '../lib/permissions.ts';
import { Spinner } from '../components/ui/Spinner.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import type { OrgUser } from '@netvigil/shared-types';

const ROLES = [
  'super_admin', 'admin', 'senior_analyst', 'analyst',
  'threat_hunter', 'forensic_investigator', 'auditor', 'developer',
] as const;

function roleBadgeColor(role: string): 'red' | 'yellow' | 'blue' | 'green' | 'gray' {
  if (role === 'super_admin') return 'red';
  if (role === 'admin') return 'yellow';
  if (role === 'senior_analyst' || role === 'threat_hunter') return 'blue';
  if (role === 'analyst' || role === 'forensic_investigator') return 'green';
  return 'gray';
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type Tab = 'active' | 'pending';

export default function TeamPage() {
  const queryClient = useQueryClient();
  const canWrite    = usePermission('users:write');
  const canApprove  = usePermission('users:approve');
  const currentRole = useRole();
  const [tab,       setTab]       = useState<Tab>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleEdit,  setRoleEdit]  = useState<string>('');

  const { data: users, isLoading, error } = useQuery<OrgUser[]>({
    queryKey: qk.users.list(),
    queryFn: () => apiClient.get<OrgUser[]>('/users'),
  });

  const { data: pendingUsers } = useQuery<OrgUser[]>({
    queryKey: qk.users.pending(),
    queryFn: () => apiClient.get<OrgUser[]>('/users?status=pending'),
    enabled: canApprove,
  });

  const patchUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { role?: string; isActive?: boolean; status?: string } }) =>
      apiClient.patch<OrgUser>(`/users/${id}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.users.list() });
      void queryClient.invalidateQueries({ queryKey: qk.users.pending() });
      setEditingId(null);
    },
  });

  const approveUser = useMutation({
    mutationFn: (id: string) => apiClient.post<OrgUser>(`/users/${id}/approve`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.users.list() });
      void queryClient.invalidateQueries({ queryKey: qk.users.pending() });
    },
  });

  const rejectUser = useMutation({
    mutationFn: (id: string) => apiClient.post<OrgUser>(`/users/${id}/reject`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.users.list() });
      void queryClient.invalidateQueries({ queryKey: qk.users.pending() });
    },
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load team'} />;

  const activeUsers  = (users ?? []).filter((u) => u.status !== 'pending');
  const pendingCount = (pendingUsers ?? []).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Team</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage roles and access for your organisation</p>
        </div>
      </div>

      {/* Tab bar */}
      {canApprove && (
        <div className="flex gap-1 rounded-lg bg-slate-800/60 p-1 border border-slate-700 w-fit">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === 'active' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Members
          </button>
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`relative rounded px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === 'pending' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pending
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-900">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Active users table */}
      {tab === 'active' && (
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">MFA</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Joined</th>
                {canWrite && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {activeUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-slate-200 font-medium">{u.email}</td>
                  <td className="px-4 py-3">
                    {editingId === u.id && canWrite ? (
                      <select
                        aria-label="Select role"
                        value={roleEdit}
                        onChange={(e) => setRoleEdit(e.target.value)}
                        className="rounded bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {ROLES.filter((r) => r !== 'super_admin' || currentRole === 'super_admin').map((r) => (
                          <option key={r} value={r}>{formatRole(r)}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge color={roleBadgeColor(u.role)}>{formatRole(u.role)}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.mfaEnrolled ? '✓ On' : '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Active' : 'Disabled'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(u.createdAt).toLocaleDateString('en-AU')}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      {/* super_admin accounts are read-only for non-super_admins */}
                      {u.role === 'super_admin' && currentRole !== 'super_admin' ? (
                        <span className="text-xs text-slate-600 italic">Protected</span>
                      ) : editingId === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => patchUser.mutate({ id: u.id, patch: { role: roleEdit } })}
                            disabled={patchUser.isPending}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-xs text-slate-500 hover:text-slate-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => { setEditingId(u.id); setRoleEdit(u.role); }}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            Edit role
                          </button>
                          <button
                            type="button"
                            onClick={() => patchUser.mutate({ id: u.id, patch: { isActive: !u.isActive } })}
                            disabled={patchUser.isPending}
                            className={`text-xs font-medium disabled:opacity-50 ${
                              u.isActive
                                ? 'text-red-400 hover:text-red-300'
                                : 'text-emerald-400 hover:text-emerald-300'
                            }`}
                          >
                            {u.isActive ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending approval table */}
      {tab === 'pending' && canApprove && (
        <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
          {(pendingUsers ?? []).length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">No pending requests</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Requested role</th>
                  <th className="px-4 py-3 text-left">Requested</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {(pendingUsers ?? []).map((u) => (
                  <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-slate-200 font-medium">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge color={roleBadgeColor(u.role)}>{formatRole(u.role)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(u.createdAt).toLocaleDateString('en-AU')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => approveUser.mutate(u.id)}
                          disabled={approveUser.isPending || rejectUser.isPending}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectUser.mutate(u.id)}
                          disabled={approveUser.isPending || rejectUser.isPending}
                          className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
