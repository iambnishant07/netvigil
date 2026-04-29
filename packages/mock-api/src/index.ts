import { alertRuleHandlers } from './handlers/alert-rules.js';
import { authHandlers } from './handlers/auth.js';
import { dashboardHandlers } from './handlers/dashboard.js';
import { deviceHandlers } from './handlers/devices.js';
import { incidentHandlers } from './handlers/incidents.js';

export const handlers = [
  ...authHandlers,
  ...deviceHandlers,
  ...incidentHandlers,
  ...dashboardHandlers,
  ...alertRuleHandlers,
];

export { alertRuleHandlers, authHandlers, dashboardHandlers, deviceHandlers, incidentHandlers };
