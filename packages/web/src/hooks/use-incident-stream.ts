import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// VITE_WS_URL takes precedence — required in production when the HTTP base
// is a relative path (e.g. Vercel rewrite) that can't be upgraded to ws://.
// Fall back to constructing from VITE_API_URL for local dev where it starts
// with http://.  If neither gives an absolute URL, streaming is disabled.
function buildWsUrl(): string | null {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit.replace(/\/?$/, '') + '/incidents/stream';
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (base?.startsWith('http')) return base.replace(/^http/, 'ws') + '/incidents/stream';
  return null;
}
const WS_URL = buildWsUrl();

export function useIncidentStream(): void {
  const queryClient = useQueryClient();
  const retryDelay = useRef(1_000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let active = true;

    function connect(): void {
      if (!active || !WS_URL) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = () => {
        retryDelay.current = 1_000;
        void queryClient.invalidateQueries({ queryKey: ['incidents'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis'] });
      };

      ws.onclose = () => {
        if (!active) return;
        timerRef.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
          connect();
        }, retryDelay.current);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [queryClient]);
}
