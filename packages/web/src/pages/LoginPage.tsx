import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '../contexts/auth-context.tsx';
import { apiClient } from '../lib/api-client.ts';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Card } from '../components/ui/Card.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import type { AuthResponse } from '@netvigil/shared-types';

const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined;

const ROLES = [
  { value: 'admin',                 label: 'Admin'                 },
  { value: 'senior_analyst',        label: 'Senior Analyst'        },
  { value: 'analyst',               label: 'Analyst'               },
  { value: 'threat_hunter',         label: 'Threat Hunter'         },
  { value: 'forensic_investigator', label: 'Forensic Investigator' },
  { value: 'auditor',               label: 'Auditor'               },
  { value: 'developer',             label: 'Developer'             },
];

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormErrors = Partial<Record<keyof z.infer<typeof schema>, string>>;

interface OrgOption { id: string; name: string; }

type GoogleStep = 'initial' | 'org_select';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState<FormErrors>({});
  const [googleError, setGoogleError] = useState('');
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Two-step Google flow
  const [googleStep, setGoogleStep]               = useState<GoogleStep>('initial');
  const [googleSessionToken, setGoogleSessionToken] = useState('');
  const [googleEmail, setGoogleEmail]             = useState('');
  const [googleOrgId, setGoogleOrgId]             = useState('');
  const [googleOrgName, setGoogleOrgName]         = useState('');
  const [googleRole, setGoogleRole]               = useState('analyst');
  const [googleOrgMode, setGoogleOrgMode]         = useState<'join' | 'create'>('join');

  const { login } = useAuth();
  const navigate  = useNavigate();

  const { data: orgs } = useQuery<OrgOption[]>({
    queryKey: ['orgs', 'list'],
    queryFn:  () => apiClient.get<OrgOption[]>('/auth/organizations'),
    enabled:  googleStep === 'org_select',
  });

  const googleMutation = useMutation({
    mutationFn: (idToken: string) =>
      apiClient.post<AuthResponse>('/auth/google', { idToken }),
    onSuccess: (data) => {
      if (data.needsOrgSelection && data.googleSessionToken) {
        setGoogleSessionToken(data.googleSessionToken);
        setGoogleEmail(data.googleEmail ?? '');
        setGoogleStep('org_select');
      } else {
        login(data);
        navigate('/dashboard', { replace: true });
      }
    },
    onError: (err: Error) => setGoogleError(err.message),
  });

  const googleCompleteMutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiClient.post<AuthResponse>('/auth/google/complete', body),
    onSuccess: (data) => {
      login(data);
      if (data.user?.status === 'pending') {
        navigate('/pending', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    },
    onError: (err: Error) => setGoogleError(err.message),
  });

  function handleGoogleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (googleOrgMode === 'join' && !googleOrgId) {
      setGoogleError('Select an organisation');
      return;
    }
    if (googleOrgMode === 'create' && !googleOrgName.trim()) {
      setGoogleError('Enter an organisation name');
      return;
    }
    setGoogleError('');
    const body: Record<string, string> = {
      googleSessionToken,
      role: googleRole,
    };
    if (googleOrgMode === 'create') {
      body['organizationName'] = googleOrgName.trim();
    } else {
      body['organizationId'] = googleOrgId;
    }
    googleCompleteMutation.mutate(body);
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current || googleStep !== 'initial') return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp: { credential: string }) => {
          googleMutation.mutate(resp.credential);
        },
      });
      window.google?.accounts.id.renderButton(googleBtnRef.current!, {
        theme: 'outline', size: 'large', width: '100%', text: 'continue_with',
      });
    };
    document.head.appendChild(script);
    return () => { script.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleStep]);

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof schema>) =>
      apiClient.post<AuthResponse>('/auth/login', data),
    onSuccess: (data) => {
      login(data);
      navigate('/dashboard', { replace: true });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = schema.safeParse({ email, password });
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
    mutation.mutate(result.data);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100">Sign in to NetVigil</h1>
          <p className="mt-1 text-sm text-slate-400">AI-driven network threat detection</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              placeholder="••••••••"
            />

            {mutation.isError && (
              <ErrorAlert message={(mutation.error as Error).message} />
            )}

            <Button type="submit" loading={mutation.isPending} className="w-full">
              Sign in
            </Button>
          </form>
        </Card>

        {GOOGLE_CLIENT_ID && (
          <Card>
            {googleError && <ErrorAlert message={googleError} />}

            {googleStep === 'initial' ? (
              <div ref={googleBtnRef} className="flex justify-center" />
            ) : (
              <form onSubmit={handleGoogleComplete} className="space-y-4" noValidate>
                <p className="text-sm text-slate-300">
                  Signing in as <span className="font-medium text-slate-100">{googleEmail}</span>.
                  Choose your organisation and role.
                </p>

                {/* Join / create toggle */}
                <div className="flex rounded-lg border border-slate-700 bg-slate-800/60 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setGoogleOrgMode('join')}
                    className={`flex-1 rounded py-1.5 text-sm font-medium transition-colors ${
                      googleOrgMode === 'join' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Join org
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoogleOrgMode('create')}
                    className={`flex-1 rounded py-1.5 text-sm font-medium transition-colors ${
                      googleOrgMode === 'create' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Create org
                  </button>
                </div>

                {googleOrgMode === 'join' ? (
                  <>
                    <Select
                      label="Organisation"
                      value={googleOrgId}
                      onChange={(e) => setGoogleOrgId(e.target.value)}
                      options={(orgs ?? []).map((o) => ({ value: o.id, label: o.name }))}
                      placeholder="Select an organisation…"
                    />
                    <Select
                      label="Role"
                      value={googleRole}
                      onChange={(e) => setGoogleRole(e.target.value)}
                      options={ROLES}
                    />
                    <p className="rounded border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
                      Joining requires admin approval before you can access data.
                    </p>
                  </>
                ) : (
                  <Input
                    label="Organisation name"
                    value={googleOrgName}
                    onChange={(e) => setGoogleOrgName(e.target.value)}
                    placeholder="Acme Pty Ltd"
                  />
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => { setGoogleStep('initial'); setGoogleError(''); }}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    loading={googleCompleteMutation.isPending}
                    className="flex-1"
                  >
                    {googleOrgMode === 'create' ? 'Create & continue' : 'Request access'}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        )}

        <p className="text-center text-sm text-slate-500">
          No account?{' '}
          <Link to="/register" className="text-indigo-400 hover:text-indigo-300">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
