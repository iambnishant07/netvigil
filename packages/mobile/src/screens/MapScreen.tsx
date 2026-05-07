import { View, Text, StyleSheet, ActivityIndicator, Platform, ScrollView, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { ThreatArc, GeoPoint } from '@netvigil/shared-types';

interface ThreatMap {
  center: GeoPoint;
  arcs: ThreatArc[];
}

// @rnmapbox/maps requires a native Development Build — not available in Expo Go.
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

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

const WEB_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? '')
  .replace('/api/v1', '')
  .replace('netvigil-api.up.railway.app', 'netvigil-lime.vercel.app');

function ThreatSummary({ arcs }: { arcs: ThreatArc[] }) {
  // Count by severity
  const bySev: Record<string, number> = {};
  for (const arc of arcs) bySev[arc.severity] = (bySev[arc.severity] ?? 0) + arc.count;

  // Group by source country
  const byCountry: Record<string, { count: number; topSev: string }> = {};
  for (const arc of arcs) {
    const c = arc.sourceCountry ?? 'Unknown';
    const existing = byCountry[c];
    if (!existing) {
      byCountry[c] = { count: arc.count, topSev: arc.severity };
    } else {
      existing.count += arc.count;
      if (SEV_ORDER.indexOf(arc.severity) < SEV_ORDER.indexOf(existing.topSev)) {
        existing.topSev = arc.severity;
      }
    }
  }

  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  return (
    <View style={ts.summary}>
      {/* Severity pills */}
      <View style={ts.pillRow}>
        {SEV_ORDER.filter(s => bySev[s]).map(s => (
          <View key={s} style={[ts.pill, { borderColor: SEV_COLOUR[s] }]}>
            <View style={[ts.pillDot, { backgroundColor: SEV_COLOUR[s] }]} />
            <Text style={ts.pillSev}>{s}</Text>
            <Text style={[ts.pillCount, { color: SEV_COLOUR[s] }]}>{bySev[s]}</Text>
          </View>
        ))}
      </View>

      {/* Top source countries */}
      {topCountries.length > 0 && (
        <View style={ts.table}>
          <Text style={ts.tableHeader}>TOP SOURCE COUNTRIES</Text>
          {topCountries.map(([country, { count, topSev }]) => (
            <View key={country} style={ts.tableRow}>
              <View style={[ts.sevBar, { backgroundColor: SEV_COLOUR[topSev] ?? '#6366f1' }]} />
              <Text style={ts.countryName}>{country}</Text>
              <Text style={ts.countryCount}>{count} events</Text>
            </View>
          ))}
        </View>
      )}

      {arcs.length === 0 && (
        <View style={ts.emptyBox}>
          <Text style={ts.emptyText}>No active threats in the last 24 hours</Text>
        </View>
      )}
    </View>
  );
}

export default function MapScreen() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', 'threat-map'],
    queryFn: () => apiClient.get<ThreatMap>('/dashboard/threat-map?hours=24'),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // Native map available (development build)
  if (Mapbox) {
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
                    [arc.to.lng,     arc.to.lat],
                  ],
                },
                properties: {},
              }}
            >
              <Mapbox.LineLayer
                id={`arc-line-${i}`}
                style={{
                  lineColor:   SEV_COLOUR[arc.severity] ?? '#6366f1',
                  lineWidth:   Math.min(arc.count, 4) as never,
                  lineOpacity: 0.8,
                } as never}
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

  // Expo Go fallback — show threat intelligence summary
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.fallbackContent}>
      <View style={styles.fallbackHeader}>
        <Text style={styles.fallbackIcon}>🗺️</Text>
        <Text style={styles.fallbackTitle}>Live Threat Intelligence</Text>
        <Text style={styles.fallbackSub}>Last 24 hours · refreshes every 2 min</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <ThreatSummary arcs={data?.arcs ?? []} />
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => void refetch()}>
          <Text style={styles.refreshBtnText}>↻  Refresh</Text>
        </TouchableOpacity>
        {!!WEB_URL && (
          <TouchableOpacity
            style={styles.webBtn}
            onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/dashboard`)}
          >
            <Text style={styles.webBtnText}>Open web dashboard →</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.devNote}>
        Interactive map requires a Development Build.{'\n'}
        <Text style={[styles.devNote, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: '#818cf8' }]}>
          eas build --profile development
        </Text>
      </Text>
    </ScrollView>
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
  fallbackContent: { padding: 16, gap: 16 },
  fallbackHeader:  { alignItems: 'center', paddingVertical: 24, gap: 6 },
  fallbackIcon:    { fontSize: 40 },
  fallbackTitle:   { fontSize: 20, fontWeight: '700', color: '#e2e8f0' },
  fallbackSub:     { fontSize: 12, color: '#64748b' },
  actions:         { flexDirection: 'row', gap: 10, marginTop: 4 },
  refreshBtn:      { flex: 1, backgroundColor: '#1e293b', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  refreshBtnText:  { color: '#94a3b8', fontWeight: '600', fontSize: 14 },
  webBtn:          { flex: 1, backgroundColor: '#312e81', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  webBtnText:      { color: '#a5b4fc', fontWeight: '600', fontSize: 14 },
  devNote:         { fontSize: 11, color: '#334155', textAlign: 'center', marginTop: 8 },
});

const ts = StyleSheet.create({
  summary:      { gap: 12 },
  pillRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 5, backgroundColor: '#1e293b' },
  pillDot:      { width: 7, height: 7, borderRadius: 4 },
  pillSev:      { color: '#94a3b8', fontSize: 12, textTransform: 'capitalize' },
  pillCount:    { fontWeight: '700', fontSize: 13 },
  table:        { backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden' },
  tableHeader:  { fontSize: 11, fontWeight: '600', color: '#475569', letterSpacing: 0.8, padding: 12, paddingBottom: 6 },
  tableRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#0f172a', gap: 10 },
  sevBar:       { width: 4, height: 30, borderRadius: 2 },
  countryName:  { flex: 1, color: '#e2e8f0', fontSize: 14, fontWeight: '500' },
  countryCount: { color: '#64748b', fontSize: 12 },
  emptyBox:     { backgroundColor: '#1e293b', borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText:    { color: '#475569', fontSize: 14 },
});
