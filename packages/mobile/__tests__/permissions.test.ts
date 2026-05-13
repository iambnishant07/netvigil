import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROLE_PERMISSIONS, formatRole, usePermission, useRole } from '../src/lib/permissions';

jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({
      id: 'u-1', email: 'a@b.com', role: 'admin', status: 'active', mfaEnrolled: false,
      organizationId: 'org-1', createdAt: '2026-01-01T00:00:00Z',
    }),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('ROLE_PERMISSIONS', () => {
  it('admin has all permissions except system:admin', () => {
    expect(ROLE_PERMISSIONS['admin']).toContain('incidents:read');
    expect(ROLE_PERMISSIONS['admin']).toContain('users:write');
    expect(ROLE_PERMISSIONS['admin']).not.toContain('system:admin');
  });

  it('super_admin has system:admin', () => {
    expect(ROLE_PERMISSIONS['super_admin']).toContain('system:admin');
  });

  it('analyst has limited read-only permissions', () => {
    const perms = ROLE_PERMISSIONS['analyst'];
    expect(perms).toContain('incidents:read');
    expect(perms).toContain('dashboard:read');
    expect(perms).not.toContain('incidents:write');
    expect(perms).not.toContain('users:write');
  });

  it('auditor has audit_logs:read', () => {
    expect(ROLE_PERMISSIONS['auditor']).toContain('audit_logs:read');
  });

  it('developer has devices:write but not incidents:read', () => {
    const perms = ROLE_PERMISSIONS['developer'];
    expect(perms).toContain('devices:write');
    expect(perms).not.toContain('incidents:read');
  });

  it('forensic_investigator has incidents:export', () => {
    expect(ROLE_PERMISSIONS['forensic_investigator']).toContain('incidents:export');
  });

  it('senior_analyst has alert_rules:write', () => {
    expect(ROLE_PERMISSIONS['senior_analyst']).toContain('alert_rules:write');
  });

  it('threat_hunter has incidents:write', () => {
    expect(ROLE_PERMISSIONS['threat_hunter']).toContain('incidents:write');
  });
});

describe('formatRole', () => {
  it('formats snake_case to Title Case', () => {
    expect(formatRole('senior_analyst')).toBe('Senior Analyst');
    expect(formatRole('threat_hunter')).toBe('Threat Hunter');
    expect(formatRole('forensic_investigator')).toBe('Forensic Investigator');
  });

  it('formats single word role', () => {
    expect(formatRole('admin')).toBe('Admin');
    expect(formatRole('analyst')).toBe('Analyst');
    expect(formatRole('auditor')).toBe('Auditor');
    expect(formatRole('developer')).toBe('Developer');
  });

  it('handles empty string', () => {
    expect(formatRole('')).toBe('');
  });
});

describe('usePermission', () => {
  it('returns true for a permission the admin role has', async () => {
    const { result } = renderHook(() => usePermission('incidents:read'), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false for system:admin (admin does not have this)', async () => {
    const { result } = renderHook(() => usePermission('system:admin'), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe('useRole', () => {
  it('returns the user role', async () => {
    const { result } = renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current).toBe('admin'));
  });
});
