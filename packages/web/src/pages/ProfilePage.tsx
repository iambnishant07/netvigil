import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client.ts';
import { useAuth } from '../contexts/auth-context.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import type { User } from '@netvigil/shared-types';

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function UserInitials({ name, email }: { name: string | null | undefined; email: string }) {
  const text = name?.trim() || email;
  const parts = text.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const last  = parts.length >= 2 ? (parts[parts.length - 1] ?? '') : '';
  const initials = last
    ? ((first[0] ?? '') + (last[0] ?? '')).toUpperCase()
    : text.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 text-2xl font-bold text-white">
      {initials}
    </div>
  );
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { user: ctxUser, login } = useAuth();

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ['profile', 'me'],
    queryFn: () => apiClient.get<User>('/auth/me'),
  });

  const [fullName, setFullName] = useState('');
  const [phone, setPhone]       = useState('');
  const [address, setAddress]   = useState('');
  const [dob, setDob]           = useState('');
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName ?? '');
    setPhone(user.phone ?? '');
    setAddress(user.address ?? '');
    setDob(user.dob ?? '');
  }, [user]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiClient.patch<User>('/auth/me', body),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      // Keep auth context in sync with the latest email/role/status
      if (ctxUser) {
        login({
          accessToken:  localStorage.getItem('nv_access_token') ?? '',
          refreshToken: localStorage.getItem('nv_refresh_token') ?? '',
          expiresIn:    900,
          user:         updated,
          mfaRequired:  false,
        });
      }
      setSaved(true);
      setSaveError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    const body: Record<string, string> = {};
    if (fullName !== (user?.fullName ?? '')) body['fullName'] = fullName;
    if (phone    !== (user?.phone    ?? '')) body['phone']    = phone;
    if (address  !== (user?.address  ?? '')) body['address']  = address;
    if (dob      !== (user?.dob      ?? '')) body['dob']      = dob;
    if (Object.keys(body).length === 0) return;
    mutation.mutate(body);
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">My Profile</h1>
        <p className="mt-0.5 text-sm text-slate-400">Manage your personal information and account details</p>
      </div>

      {/* Avatar + identity */}
      <Card>
        <div className="flex items-center gap-5">
          <UserInitials name={user.fullName} email={user.email} />
          <div className="space-y-1">
            <p className="text-lg font-semibold text-slate-100">{user.fullName || user.email}</p>
            <p className="text-sm text-slate-400">{user.email}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge color="blue">{formatRole(user.role)}</Badge>
              <Badge color={user.status === 'active' ? 'green' : user.status === 'pending' ? 'yellow' : 'red'}>
                {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Editable personal info */}
      <Card>
        <form onSubmit={handleSave} className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Personal Information</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
            />
            <Input
              label="Phone number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+61 4xx xxx xxx"
            />
          </div>

          <Input
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Example St, Melbourne VIC 3000"
          />

          <Input
            label="Date of birth"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="max-w-xs"
          />

          {saveError && <ErrorAlert message={saveError} />}

          <div className="flex items-center gap-3">
            <Button type="submit" loading={mutation.isPending}>
              Save changes
            </Button>
            {saved && (
              <span className="text-sm text-emerald-400">Saved successfully</span>
            )}
          </div>
        </form>
      </Card>

      {/* Read-only account info */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Account Details</h2>
        <div className="space-y-3">
          <Row label="Email address" value={user.email} />
          <Row label="Organisation" value={user.organizationName ?? '—'} />
          <Row label="Role" value={formatRole(user.role)} />
          <Row
            label="Member since"
            value={new Date(user.createdAt).toLocaleDateString('en-AU', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          />
          <Row label="MFA" value={user.mfaEnrolled ? 'Enabled' : 'Not set up'} />
        </div>
      </Card>

      {/* Sign-in methods */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Sign-in Methods</h2>
        <div className="space-y-2">
          <SignInMethod
            icon="🔑"
            label="Password"
            description="Email and password authentication"
            active={user.hasPasswordAuth ?? false}
          />
          <SignInMethod
            icon="🔵"
            label="Google"
            description="Sign in with your Google account"
            active={user.hasGoogleAuth ?? false}
          />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 font-medium">{value}</span>
    </div>
  );
}

function SignInMethod({ icon, label, description, active }: {
  icon: string;
  label: string;
  description: string;
  active: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
      active ? 'border-slate-600 bg-slate-700/40' : 'border-slate-700/50 opacity-40'
    }`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <div>
          <p className="text-sm font-medium text-slate-200">{label}</p>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </div>
      <Badge color={active ? 'green' : 'gray'}>{active ? 'Active' : 'Not linked'}</Badge>
    </div>
  );
}
