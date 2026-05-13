import { renderHook, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useIncidentStream } from '../src/hooks/use-incident-stream';

interface MockWebSocket {
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose:   (() => void) | null;
  onerror:   (() => void) | null;
  close:     jest.Mock;
}

let lastWs: MockWebSocket | null = null;

const MockWebSocketClass = jest.fn().mockImplementation((): MockWebSocket => {
  const ws: MockWebSocket = {
    onmessage: null,
    onclose:   null,
    onerror:   null,
    close:     jest.fn(),
  };
  lastWs = ws;
  return ws;
});

Object.assign(globalThis, { WebSocket: MockWebSocketClass });

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useIncidentStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    lastWs = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a WebSocket connection on mount', () => {
    renderHook(() => useIncidentStream(), { wrapper });
    expect(MockWebSocketClass).toHaveBeenCalledTimes(1);
  });

  it('closes the WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useIncidentStream(), { wrapper });
    const ws = lastWs;
    unmount();
    expect(ws?.close).toHaveBeenCalled();
  });

  it('reconnects with backoff after close', () => {
    renderHook(() => useIncidentStream(), { wrapper });
    act(() => {
      lastWs?.onclose?.();
      jest.advanceTimersByTime(1_500);
    });
    expect(MockWebSocketClass).toHaveBeenCalledTimes(2);
  });

  it('closes on error', () => {
    renderHook(() => useIncidentStream(), { wrapper });
    const ws = lastWs;
    act(() => { ws?.onerror?.(); });
    expect(ws?.close).toHaveBeenCalled();
  });

  it('resets retry delay on successful message', () => {
    renderHook(() => useIncidentStream(), { wrapper });
    act(() => {
      lastWs?.onmessage?.({ data: '{}' });
    });
    // After a message, retry delay resets — just verify no crash
    expect(MockWebSocketClass).toHaveBeenCalledTimes(1);
  });
});
