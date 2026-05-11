export type * from './openapi.d.ts';
import type { components } from './openapi.d.ts';

// Convenience aliases — consumers import these directly instead of
// drilling into components['schemas'] every time.
export type ApiError = components['schemas']['Error'];

export type RegisterRequest = components['schemas']['RegisterRequest'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type AuthResponse = components['schemas']['AuthResponse'];
export type User = components['schemas']['User'];

export type DeviceVendor = components['schemas']['DeviceVendor'];
export type DeviceProtocol = components['schemas']['DeviceProtocol'];
export type Device = components['schemas']['Device'];
export type DeviceCreate = components['schemas']['DeviceCreate'];
export type DeviceUpdate = components['schemas']['DeviceUpdate'];
export type DeviceList = components['schemas']['DeviceList'];

export type Severity = components['schemas']['Severity'];
export type IncidentStatus = components['schemas']['IncidentStatus'];
export type AttackLabel = components['schemas']['AttackLabel'];
export type Incident = components['schemas']['Incident'];
export type IncidentList = components['schemas']['IncidentList'];
export type IncidentEvent = components['schemas']['IncidentEvent'];

export type DashboardKpis = components['schemas']['DashboardKpis'];
export type GeoPoint = components['schemas']['GeoPoint'];
export type ThreatArc = components['schemas']['ThreatArc'];

export type AlertChannel = components['schemas']['AlertChannel'];
export type AlertRule = components['schemas']['AlertRule'];
export type AlertRuleCreate = components['schemas']['AlertRuleCreate'];
export type AlertRuleUpdate = components['schemas']['AlertRuleUpdate'];

export type UserRole = components['schemas']['UserRole'];
export type UserStatus = components['schemas']['UserStatus'];
export type OrgUser = components['schemas']['OrgUser'];
export type AdminOrg = components['schemas']['AdminOrg'];
export type AdminUser = components['schemas']['AdminUser'];
