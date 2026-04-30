import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:8000/api/v1';
const WS_URL = BASE.replace(/^http/, 'ws') + '/incidents/stream';

export function useIncidentStream(): void {
  const queryClient = useQueryClient();
  const retryDelay = useRef(1_000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let active = true;

    function connect(): void {
      if (!active) return;
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
