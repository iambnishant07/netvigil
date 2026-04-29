import type { Severity, IncidentStatus } from '@netvigil/shared-types';

const SEVERITY_CLS: Record<Severity, string> = {
  info:     'bg-slate-600 text-slate-100',
  low:      'bg-blue-700 text-blue-100',
  medium:   'bg-yellow-600 text-yellow-100',
  high:     'bg-orange-600 text-orange-100',
  critical: 'bg-red-700 text-red-100',
};

const STATUS_CLS: Record<IncidentStatus, string> = {
  open:           'bg-red-900 text-red-200',
  acknowledged:   'bg-yellow-900 text-yellow-200',
  confirmed:      'bg-orange-900 text-orange-200',
  false_positive: 'bg-slate-700 text-slate-300',
};

interface SeverityBadgeProps { value: Severity }
interface StatusBadgeProps   { value: IncidentStatus }

export function SeverityBadge({ value }: SeverityBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${SEVERITY_CLS[value]}`}>
      {value}
    </span>
  );
}

export function StatusBadge({ value }: StatusBadgeProps) {
  const label = value.replace('_', ' ');
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_CLS[value]}`}>
      {label}
    </span>
  );
}
