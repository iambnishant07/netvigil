import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '../contexts/auth-context.tsx';
import { apiClient } from '../lib/api-client.ts';
import { qk } from '../lib/query-keys.ts';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Card } from '../components/ui/Card.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import type { AuthResponse } from '@aankhanet/shared-types';

const TIMEZONES = [
  { value: 'Australia/Sydney',    label: 'Sydney (AEDT/AEST)'   },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEDT/AEST)' },
  { value: 'Australia/Brisbane',  label: 'Brisbane (AEST)'       },
  { value: 'Australia/Adelaide',  label: 'Adelaide (ACDT/ACST)'  },
  { value: 'Australia/Perth',     label: 'Perth (AWST)'          },
  { value: 'Australia/Darwin',    label: 'Darwin (ACST)'         },
  { value: 'Australia/Hobart',    label: 'Hobart (AEDT/AEST)'   },
  { value: 'Pacific/Auckland',    label: 'Auckland (NZDT/NZST)'  },
  { value: 'UTC',                 label: 'UTC'                   },
];

const ROLES = [
  { value: 'admin',                 label: 'Admin'                 },
  { value: 'senior_analyst',        label: 'Senior Analyst'        },
  { value: 'analyst',               label: 'Analyst'               },
  { value: 'threat_hunter',         label: 'Threat Hunter'         },
  { value: 'forensic_investigator', label: 'Forensic Investigator' },
  { value: 'auditor',               label: 'Auditor'               },
  { value: 'developer',             label: 'Developer'             },
];

const profileSchema = z.object({
  fullName: z.string().optional(),
  phone:    z.string().optional(),
  dob:      z.string().optional(),
});

const createSchema = z.object({
  mode:             z.literal('create'),
  organizationName: z.string().min(2, 'Organisation name must be at least 2 characters'),
  email:            z.string().email('Enter a valid email address'),
  password:         z.string().min(12, 'Password must be at least 12 characters'),
  timezone:         z.string().min(1, 'Select a timezone'),
}).merge(profileSchema);

const joinSchema = z.object({
  mode:           z.literal('join'),
  organizationId: z.string().min(1, 'Select an organisation'),
  email:          z.string().email('Enter a valid email address'),
  password:       z.string().min(12, 'Password must be at least 12 characters'),
  role:           z.string().min(1, 'Select a role'),
}).merge(profileSchema);

type Mode = 'create' | 'join';
type FormErrors = Record<string, string>;

interface OrgOption {
  id: string;
  name: string;
}

export default function RegisterPage() {
  const [mode,     setMode]     = useState<Mode>('join');
  const [orgName,  setOrgName]  = useState('');
  const [orgId,    setOrgId]    = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [timezone, setTimezone] = useState('Australia/Sydney');
  const [role,     setRole]     = useState('analyst');
  const [fullName, setFullName] = useState('');
  const [phone,    setPhone]    = useState('');
  const [dob,      setDob]      = useState('');
  const [errors,   setErrors]   = useState<FormErrors>({});

  const { login } = useAuth();
  const navigate  = useNavigate();

  const { data: orgs } = useQuery<OrgOption[]>({
    queryKey: qk.orgs.list(),
    queryFn:  () => apiClient.get<OrgOption[]>('/auth/organizations'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiClient.post<AuthResponse>('/auth/register', body),
    onSuccess: (data) => {
      login(data);
      if (data.user?.status === 'pending') {
        navigate('/pending', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    },
  });

  function buildProfileFields(): Record<string, string> {
    const fields: Record<string, string> = {};
    if (fullName.trim()) fields.fullName = fullName.trim();
    if (phone.trim())    fields.phone    = phone.trim();
    if (dob)             fields.dob      = dob;
    return fields;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'create') {
      const result = createSchema.safeParse({ mode, organizationName: orgName, email, password, timezone, fullName, phone, dob });
      if (!result.success) {
        const fe: FormErrors = {};
        for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message;
        setErrors(fe);
        return;
      }
      setErrors({});
      mutation.mutate({ organizationName: orgName, email, password, timezone, ...buildProfileFields() });
    } else {
      const result = joinSchema.safeParse({ mode, organizationId: orgId, email, password, role, fullName, phone, dob });
      if (!result.success) {
        const fe: FormErrors = {};
        for (const issue of result.error.issues) fe[String(issue.path[0])] = issue.message;
        setErrors(fe);
        return;
      }
      setErrors({});
      mutation.mutate({ organizationId: orgId, email, password, role, ...buildProfileFields() });
    }
  }

  const orgOptions = (orgs ?? []).map((o) => ({ value: o.id, label: o.name }));

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 bg-[url('/logo-bg.png')] bg-cover bg-center bg-no-repeat px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100">Create an account</h1>
          <p className="mt-1 text-sm text-slate-400">Get started with AankhaNet</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button
            type="button"
            onClick={() => setMode('join')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'join'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Join organisation
          </button>
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Create organisation
          </button>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Organisation fields */}
            {mode === 'create' ? (
              <>
                <Input
                  label="Organisation name"
                  type="text"
                  autoComplete="organization"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  error={errors.organizationName}
                  placeholder="Acme Pty Ltd"
                />
                <Select
                  label="Timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  options={TIMEZONES}
                />
              </>
            ) : (
              <>
                <Select
                  label="Organisation"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  options={[{ value: '', label: 'Select an organisation…' }, ...orgOptions]}
                  error={errors.organizationId}
                />
                <Select
                  label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={ROLES}
                  error={errors.role}
                />
                <p className="text-xs text-amber-400">
                  Joining an organisation requires admin approval before you can access data.
                </p>
              </>
            )}

            {/* Account credentials */}
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              placeholder="At least 12 characters"
            />

            {/* Profile details */}
            <div className="border-t border-slate-700 pt-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Profile details <span className="normal-case font-normal">(optional)</span>
              </p>
              <div className="space-y-4">
                <Input
                  label="Full name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  error={errors.fullName}
                  placeholder="Jane Smith"
                />
                <Input
                  label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  error={errors.phone}
                  placeholder="+61 400 000 000"
                />
                <Input
                  label="Date of birth"
                  type="date"
                  autoComplete="bday"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  error={errors.dob}
                />
              </div>
            </div>

            {mutation.isError && (
              <ErrorAlert message={(mutation.error as Error).message} />
            )}

            <Button type="submit" loading={mutation.isPending} className="w-full">
              {mode === 'create' ? 'Create account' : 'Request access'}
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
