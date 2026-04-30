export const qk = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  dashboard: {
    kpis: () => ['dashboard', 'kpis'] as const,
  },
  incidents: {
    list:   (filters: Record<string, unknown>) => ['incidents', 'list', filters] as const,
    detail: (id: string)                        => ['incidents', id] as const,
  },
  devices: {
    list: () => ['devices', 'list'] as const,
  },
  alertRules: {
    list: () => ['alert-rules', 'list'] as const,
  },
} as const;
