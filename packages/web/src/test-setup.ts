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

// mapbox-gl uses WebGL which is unavailable in jsdom — mock the whole module.
vi.mock('mapbox-gl', () => {
  class MockMap {
    on(event: string, cb: () => void) {
      if (event === 'load') cb();
      return this;
    }
    off() { return this; }
    remove() {}
    isStyleLoaded() { return true; }
    addSource() {}
    getSource() { return null; }
    addLayer() {}
    getLayer() { return null; }
    getStyle() { return { layers: [] }; }
    setLayoutProperty() {}
    setPaintProperty() {}
  }
  class MockMarker {
    setLngLat() { return this; }
    addTo() { return this; }
    remove() {}
    getElement() { return document.createElement('div'); }
  }
  return { default: { Map: MockMap, Marker: MockMarker, accessToken: '' } };
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
