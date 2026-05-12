import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { AuthProvider } from './contexts/auth-context.tsx';
import type { User } from '@aankhanet/shared-types';

export const TEST_USER: User = {
  id: '018e1234-0000-7000-8000-000000000001',
  organizationId: '018e1234-0000-7000-8000-000000000000',
  email: 'test@example.com',
  role: 'admin',
  status: 'active',
  mfaEnrolled: false,
  createdAt: '2024-01-01T00:00:00Z',
};

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries:   { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface Options {
  authenticated?: boolean;
  initialPath?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  { authenticated = false, initialPath = '/' }: Options = {},
): RenderResult {
  if (authenticated) {
    localStorage.setItem('nv_user', JSON.stringify(TEST_USER));
    localStorage.setItem('nv_access_token', 'mock-token');
  }
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
