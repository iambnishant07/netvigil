export const qk = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  dashboard: {
    kpis:        ()              => ['dashboard', 'kpis'] as const,
    threatMap:   (hours: number) => ['dashboard', 'threat-map', hours] as const,
    trend:       ()              => ['dashboard', 'trend'] as const,
    attackTypes: ()              => ['dashboard', 'attack-types'] as const,
  },
  incidents: {
    list:   (filters: Record<string, unknown>) => ['incidents', 'list', filters] as const,
    detail: (id: string)                        => ['incidents', id] as const,
  },
  devices: {
    list:   (page: number) => ['devices', 'list', page] as const,
    detail: (id: string)   => ['devices', id] as const,
  },
  alertRules: {
    list: () => ['alert-rules', 'list'] as const,
  },
  users: {
    list: (status?: string) => ['users', 'list', status] as const,
    pending: ()             => ['users', 'list', 'pending'] as const,
  },
  auditLogs: {
    list: (page: number) => ['audit-logs', 'list', page] as const,
  },
  geo: {
    lookup: (ip: string) => ['geo', ip] as const,
  },
  orgs: {
    list: () => ['orgs', 'list'] as const,
  },
  admin: {
    orgs:     ()          => ['admin', 'orgs'] as const,
    orgUsers: (id: string) => ['admin', 'orgs', id, 'users'] as const,
    users:    ()          => ['admin', 'users'] as const,
  },
} as const;
