import { describe, expect, it } from 'vitest';
import { handlers } from './index.js';

describe('handlers', () => {
  it('exports a non-empty handler list', () => {
    expect(handlers.length).toBeGreaterThan(0);
  });

  // Counts every path+method pair in openapi.yaml (excluding /incidents/stream WebSocket):
  // auth×4 + devices×5 + incidents×3 + dashboard×2 + alert-rules×4 = 18
  // Update this number whenever a new endpoint is added to the spec.
  it('covers all 18 OpenAPI endpoints', () => {
    expect(handlers).toHaveLength(18);
  });
});
