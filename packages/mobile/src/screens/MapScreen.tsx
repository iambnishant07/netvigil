import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { ThreatArc, GeoPoint } from '@netvigil/shared-types';

interface ThreatMap {
  center: GeoPoint;
  arcs: ThreatArc[];
}

// @rnmapbox/maps requires a native Development Build — not available in Expo Go.
// We lazy-load it so the rest of the app still works without it.
let Mapbox: typeof import('@rnmapbox/maps') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Mapbox = require('@rnmapbox/maps') as typeof import('@rnmapbox/maps');
  const token = process.env['EXPO_PUBLIC_MAPBOX_TOKEN'] ?? '';
  if (token) Mapbox.default.setAccessToken(token);
} catch {
  // Running in Expo Go — native module not compiled
}

const SEV_COLOUR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#3b82f6',
  info:     '#6366f1',
};

export default function MapScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'threat-map'],
    queryFn: () => apiClient.get<ThreatMap>('/dashboard/threat-map?hours=24'),
    staleTime: 60_000,
  });

  if (!Mapbox) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackIcon}>🗺️</Text>
        <Text style={styles.fallbackTitle}>Threat Map</Text>
        <Text style={styles.fallbackDesc}>
          The map requires a Development Build.{'\n'}
          Run: <Text style={styles.code}>eas build --profile development</Text>
        </Text>
        {data && data.arcs.length > 0 && (
          <View style={styles.arcList}>
            <Text style={styles.arcListTitle}>Active threat arcs ({data.arcs.length})</Text>
            {data.arcs.slice(0, 10).map((arc, i) => (
              <View key={i} style={styles.arcRow}>
                <View style={[styles.dot, { backgroundColor: SEV_COLOUR[arc.severity] ?? '#6366f1' }]} />
                <Text style={styles.arcText}>
                  {arc.sourceCountry ?? '??'} → {arc.severity} × {arc.count}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const center = data?.center ?? { lat: -33.8688, lng: 151.2093 };
  const arcs = data?.arcs ?? [];

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Dark}>
        <Mapbox.Camera
          centerCoordinate={[center.lng, center.lat]}
          zoomLevel={2}
          animationMode="none"
        />
        {arcs.map((arc, i) => (
          <Mapbox.ShapeSource
            key={`arc-${i}`}
            id={`arc-${i}`}
            shape={{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [arc['from'].lng, arc['from'].lat],
                  [arc.to.lng, arc.to.lat],
                ],
              },
              properties: {},
            }}
          >
            <Mapbox.LineLayer
              id={`arc-line-${i}`}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              style={{
                lineColor:   SEV_COLOUR[arc.severity] ?? '#6366f1',
                lineWidth:   Math.min(arc.count, 4) as any,
                lineOpacity: 0.8,
              } as any}
            />
          </Mapbox.ShapeSource>
        ))}
      </Mapbox.MapView>
      <View style={styles.legend}>
        {Object.entries(SEV_COLOUR).map(([sev, col]) => (
          <View key={sev} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: col }]} />
            <Text style={styles.legendText}>{sev}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0f172a' },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  map:             { flex: 1 },
  legend:          { position: 'absolute', bottom: 24, right: 16, backgroundColor: '#1e293bcc', borderRadius: 10, padding: 10, gap: 4 },
  legendRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText:      { color: '#e2e8f0', fontSize: 11, textTransform: 'capitalize' },
  dot:             { width: 8, height: 8, borderRadius: 4 },
  fallback:        { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  fallbackIcon:    { fontSize: 48 },
  fallbackTitle:   { fontSize: 20, fontWeight: '700', color: '#e2e8f0' },
  fallbackDesc:    { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 22 },
  code:            { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#818cf8' },
  arcList:         { width: '100%', backgroundColor: '#1e293b', borderRadius: 10, padding: 16, gap: 8, marginTop: 8 },
  arcListTitle:    { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  arcRow:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arcText:         { fontSize: 13, color: '#cbd5e1' },
});
