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
// jsdom doesn't implement getContext; suppress the noise (animation loop handles null ctx gracefully).
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as typeof HTMLCanvasElement.prototype.getContext;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
