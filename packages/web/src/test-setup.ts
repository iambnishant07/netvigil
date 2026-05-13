import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './mocks/server.ts';

// Recharts uses ResizeObserver which jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub;

// ThreatMap uses <canvas> + requestAnimationFrame — both available in jsdom.
// d3-geo / topojson / world-atlas are real imports; no WebGL involved, no mock needed.

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
