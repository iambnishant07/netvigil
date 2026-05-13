import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../lib/query-keys.ts';
import { apiClient } from '../lib/api-client.ts';
import { usePermission } from '../lib/permissions.ts';
import { Spinner } from '../components/ui/Spinner.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import type { AdminOrg, AdminUser } from '@aankhanet/shared-types';

interface SeedResult { seeded: { incidents: number; devices: number; alertRules: number } }

function SimulateAttackPanel() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<SeedResult['seeded'] | null>(null);

  const seed = useMutation({
    mutationFn: () => apiClient.post<SeedResult>('/seed', {}),
    onSuccess: (data) => {
      setLastResult(data.seeded);
      void queryClient.invalidateQueries({ queryKey: qk.dashboard.kpis() });
      void queryClient.invalidateQueries({ queryKey: qk.incidents.list({}) });
    },
  });

  function handleSimulate() {
    if (!window.confirm('This will insert 20 demo incidents into your organisation. Continue?')) return;
    setLastResult(null);
    seed.mutate();
  }

  return (
    <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-red-300">Simulate Attack</h2>
          <p className="mt-1 text-xs text-slate-400 max-w-lg">
            Seeds 20 realistic incidents (port scans, DDoS, brute-force, C2, web attacks) into this
            organisation for demo and training purposes. Re-running adds another batch.
            Only visible to super-admin.
          </p>
          {lastResult && (
            <p className="mt-2 text-xs text-emerald-400">
              Seeded: {lastResult.incidents} incidents · {lastResult.devices} devices · {lastResult.alertRules} alert rules
            </p>
          )}
          {seed.isError && (
            <p className="mt-2 text-xs text-red-400">{(seed.error as Error).message}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSimulate}
          disabled={seed.isPending}
          className="flex-shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white
                     hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {seed.isPending ? 'Simulating…' : 'Simulate Attack'}
        </button>
      </div>
    </div>
  );
}

const ROLES = [
  'super_admin', 'admin', 'senior_analyst', 'analyst',
  'threat_hunter', 'forensic_investigator', 'auditor', 'developer',
] as const;

const STATUSES = ['active', 'pending', 'rejected'] as const;

function roleBadgeColor(role: string): 'red' | 'yellow' | 'blue' | 'green' | 'gray' {
  if (role === 'super_admin') return 'red';
  if (role === 'admin') return 'yellow';
  if (role === 'senior_analyst' || role === 'threat_hunter') return 'blue';
  if (role === 'analyst' || role === 'forensic_investigator') return 'green';
  return 'gray';
}

function statusBadgeColor(s: string): 'green' | 'yellow' | 'red' | 'gray' {
  if (s === 'active') return 'green';
  if (s === 'pending') return 'yellow';
  if (s === 'rejected') return 'red';
  return 'gray';
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type View = 'orgs' | 'users';

export default function AdminPage() {
  const queryClient = useQueryClient();
  const isSuperAdmin = usePermission('system:admin');
  const [view,        setView]        = useState<View>('orgs');
  const [selectedOrg, setSelectedOrg] = useState<AdminOrg | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [userPatch,   setUserPatch]   = useState<{ role: string; status: string }>({ role: '', status: '' });

  const { data: orgs, isLoading: orgsLoading, error: orgsError } = useQuery<AdminOrg[]>({
    queryKey: qk.admin.orgs(),
    queryFn: () => apiClient.get<AdminOrg[]>('/admin/organizations'),
  });

  const { data: allUsers, isLoading: usersLoading, error: usersError } = useQuery<AdminUser[]>({
    queryKey: qk.admin.users(),
    queryFn: () => apiClient.get<AdminUser[]>('/admin/users'),
    enabled: view === 'users' && !selectedOrg,
  });

  const { data: orgUsers, isLoading: orgUsersLoading } = useQuery<AdminUser[]>({
    queryKey: qk.admin.orgUsers(selectedOrg?.id ?? ''),
    queryFn: () => apiClient.get<AdminUser[]>(`/admin/organizations/${selectedOrg!.id}/users`),
    enabled: !!selectedOrg,
  });

  const patchUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { role?: string; status?: string; isActive?: boolean } }) =>
      apiClient.patch<AdminUser>(`/admin/users/${id}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.admin.users() });
      if (selectedOrg) void queryClient.invalidateQueries({ queryKey: qk.admin.orgUsers(selectedOrg.id) });
      setEditingUser(null);
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/users/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.admin.users() });
      void queryClient.invalidateQueries({ queryKey: qk.admin.orgs() });
      if (selectedOrg) void queryClient.invalidateQueries({ queryKey: qk.admin.orgUsers(selectedOrg.id) });
    },
  });

  function handleDelete(u: AdminUser) {
    if (!window.confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
    deleteUser.mutate(u.id);
  }

  const displayUsers = selectedOrg ? (orgUsers ?? []) : (allUsers ?? []);
  const isUsersLoading = selectedOrg ? orgUsersLoading : usersLoading;
  const usersErrDisplay = selectedOrg ? null : usersError;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">System Administration</h1>
        <p className="text-sm text-slate-400 mt-0.5">Super-admin view — all organisations and users</p>
      </div>

      {isSuperAdmin && <SimulateAttackPanel />}

      {/* View toggle */}
      <div className="flex gap-1 rounded-lg bg-slate-800/60 p-1 border border-slate-700 w-fit">
        <button
          type="button"
          onClick={() => { setView('orgs'); setSelectedOrg(null); }}
          className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
            view === 'orgs' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Organisations
        </button>
        <button
          type="button"
          onClick={() => { setView('users'); setSelectedOrg(null); }}
          className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
            view === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All Users
        </button>
      </div>

      {/* Organisations view */}
      {view === 'orgs' && !selectedOrg && (
        <>
          {orgsLoading && <Spinner />}
          {orgsError && <ErrorAlert message={orgsError instanceof Error ? orgsError.message : 'Failed to load'} />}
          {orgs && (
            <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Timezone</th>
                    <th className="px-4 py-3 text-left">Users</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {orgs.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 text-slate-200 font-medium">{org.name}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{org.timezone}</td>
                      <td className="px-4 py-3 text-slate-300">{org.userCount}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(org.createdAt).toLocaleDateString('en-AU')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => { setSelectedOrg(org); setView('users'); }}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          View users
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Users view (all or org-scoped) */}
      {(view === 'users' || selectedOrg) && (
        <>
          {selectedOrg && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setSelectedOrg(null); setView('orgs'); }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ← All organisations
              </button>
              <span className="text-sm text-slate-200 font-medium">{selectedOrg.name}</span>
            </div>
          )}

          {isUsersLoading && <Spinner />}
          {usersErrDisplay && <ErrorAlert message={usersErrDisplay instanceof Error ? usersErrDisplay.message : 'Failed to load'} />}

          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Email</th>
                  {!selectedOrg && <th className="px-4 py-3 text-left">Organisation</th>}
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {displayUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-slate-200 font-medium">{u.email}</td>
                    {!selectedOrg && (
                      <td className="px-4 py-3 text-slate-400 text-xs">{u.organizationName}</td>
                    )}
                    <td className="px-4 py-3">
                      {editingUser === u.id ? (
                        <select
                          aria-label="Select role"
                          value={userPatch.role}
                          onChange={(e) => setUserPatch((p) => ({ ...p, role: e.target.value }))}
                          className="rounded bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{formatRole(r)}</option>
                          ))}
                        </select>
                      ) : (
                        <Badge color={roleBadgeColor(u.role)}>{formatRole(u.role)}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingUser === u.id ? (
                        <select
                          aria-label="Select status"
                          value={userPatch.status}
                          onChange={(e) => setUserPatch((p) => ({ ...p, status: e.target.value }))}
                          className="rounded bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      ) : (
                        <Badge color={statusBadgeColor(u.status)}>
                          {u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Yes' : 'No'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingUser === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => patchUser.mutate({
                              id: u.id,
                              patch: { role: userPatch.role, status: userPatch.status },
                            })}
                            disabled={patchUser.isPending}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingUser(null)}
                            className="text-xs text-slate-500 hover:text-slate-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => { setEditingUser(u.id); setUserPatch({ role: u.role, status: u.status }); }}
                            className="text-xs text-slate-400 hover:text-slate-200"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => patchUser.mutate({ id: u.id, patch: { isActive: !u.isActive } })}
                            disabled={patchUser.isPending}
                            className={`text-xs font-medium disabled:opacity-50 ${
                              u.isActive ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'
                            }`}
                          >
                            {u.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(u)}
                            disabled={deleteUser.isPending}
                            className="text-xs font-medium text-red-500 hover:text-red-400 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
