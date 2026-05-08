/**
 * RBAC permission registry for the mobile client.
 * Must stay in sync with services/api/src/netvigil_api/permissions.py
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import type { User } from '@netvigil/shared-types';

const ALL_PERMISSIONS = [
  'incidents:read', 'incidents:write', 'incidents:acknowledge', 'incidents:export',
  'devices:read', 'devices:write',
  'alert_rules:read', 'alert_rules:write',
  'dashboard:read',
  'users:read', 'users:write',
  'audit_logs:read',
  'system:admin',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((p) => p !== 'system:admin'),
  senior_analyst: [
    'incidents:read', 'incidents:write', 'incidents:acknowledge', 'incidents:export',
    'devices:read',
    'alert_rules:read', 'alert_rules:write',
    'dashboard:read',
    'users:read',
    'audit_logs:read',
  ],
  analyst: [
    'incidents:read', 'incidents:acknowledge',
    'devices:read',
    'dashboard:read',
  ],
  threat_hunter: [
    'incidents:read', 'incidents:write', 'incidents:export',
    'devices:read',
    'alert_rules:read',
    'dashboard:read',
  ],
  forensic_investigator: [
    'incidents:read', 'incidents:export',
    'devices:read',
    'dashboard:read',
    'audit_logs:read',
  ],
  auditor: [
    'incidents:read', 'incidents:export',
    'devices:read',
    'dashboard:read',
    'audit_logs:read',
  ],
  developer: [
    'devices:read', 'devices:write',
    'dashboard:read',
  ],
} as const;

export function usePermission(permission: Permission): boolean {
  const { data: user } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<User>('/auth/me'),
    staleTime: 5 * 60 * 1000,
  });
  const role = user?.role ?? '';
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function useRole(): string {
  const { data: user } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<User>('/auth/me'),
    staleTime: 5 * 60 * 1000,
  });
  return user?.role ?? '';
}

export function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
