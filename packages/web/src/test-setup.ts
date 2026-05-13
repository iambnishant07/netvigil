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

// react-globe.gl uses Three.js / WebGL which is unavailable in jsdom — mock it.
// The wrapper div in ThreatMap carries aria-label="World threat map", so tests
// can still find the component without the actual globe being rendered.
vi.mock('react-globe.gl', () => ({
  default: () => null,
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
