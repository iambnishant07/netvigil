import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '../contexts/auth-context.tsx';
import { apiClient } from '../lib/api-client.ts';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Card } from '../components/ui/Card.tsx';
import { ErrorAlert } from '../components/ui/ErrorAlert.tsx';
import type { AuthResponse } from '@netvigil/shared-types';

const schema = z.object({
  organizationName: z.string().min(2, 'Organisation name must be at least 2 characters'),
  email:            z.string().email('Enter a valid email address'),
  password:         z.string().min(12, 'Password must be at least 12 characters'),
  timezone:         z.string().min(1, 'Select a timezone'),
});

type FormErrors = Partial<Record<keyof z.infer<typeof schema>, string>>;

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

export default function RegisterPage() {
  const [orgName,   setOrgName]   = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [timezone,  setTimezone]  = useState('Australia/Sydney');
  const [errors,    setErrors]    = useState<FormErrors>({});

  const { login } = useAuth();
  const navigate  = useNavigate();

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof schema>) =>
      apiClient.post<AuthResponse>('/auth/register', data),
    onSuccess: (data) => {
      login(data);
      navigate('/dashboard', { replace: true });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = schema.safeParse({ organizationName: orgName, email, password, timezone });
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
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100">Create your organisation</h1>
          <p className="mt-1 text-sm text-slate-400">Set up NetVigil for your network</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Organisation name"
              type="text"
              autoComplete="organization"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              error={errors.organizationName}
              placeholder="Acme Pty Ltd"
            />
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
            <Select
              label="Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={TIMEZONES}
            />

            {mutation.isError && (
              <ErrorAlert message={(mutation.error as Error).message} />
            )}

            <Button type="submit" loading={mutation.isPending} className="w-full">
              Create account
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
