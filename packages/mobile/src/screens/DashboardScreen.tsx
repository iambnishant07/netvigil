import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIncidentStream } from '../hooks/use-incident-stream';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { qk } from '../lib/query-keys';
import { apiClient } from '../lib/api-client';
import SeverityBadge from '../components/SeverityBadge';
import type { DashboardKpis, IncidentList, Severity } from '@aankhanet/shared-types';
import type { AppTabParamList } from '../navigation/AppNavigator';

type NavProp = BottomTabNavigationProp<AppTabParamList>;

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const SEV_COLORS: Record<Severity, string> = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#ca8a04',
  low:      '#1d4ed8',
  info:     '#64748b',
};

interface KpiTileProps {
  label: string;
  value: string | number;
  accent?: string;
}

function KpiTile({ label, value, accent = '#e2e8f0' }: KpiTileProps) {
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

interface SeedResult {
  seeded: {
    incidents: number;
    devices:   number;
    alertRules: number;
  };
}

export default function DashboardScreen() {
  useIncidentStream();

  const navigation  = useNavigation<NavProp>();
  const queryClient = useQueryClient();

  const seedMutation = useMutation({
    mutationFn: () => apiClient.post<SeedResult>('/seed', {}),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk.incidents.list({}) });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard.kpis() });
      Alert.alert(
        'Attack simulated',
        `Seeded ${data.seeded.incidents} incidents, ${data.seeded.devices} devices, ${data.seeded.alertRules} alert rules.`,
      );
    },
    onError: (err: Error) => {
      Alert.alert('Simulation failed', err.message);
    },
  });

  const { data: kpis, isLoading } = useQuery({
    queryKey: qk.dashboard.kpis(),
    queryFn:  () => apiClient.get<DashboardKpis>('/dashboard/kpis'),
    refetchInterval: 10_000,
  });

  const { data: recentIncidents } = useQuery({
    queryKey: qk.incidents.list({ pageSize: 5 }),
    queryFn:  () => apiClient.get<IncidentList>('/incidents?pageSize=5'),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
  const maxCount = kpis
    ? Math.max(...severities.map((s) => kpis.openIncidentsBySeverity[s]), 1)
    : 1;
  const totalOpen = kpis
    ? Object.values(kpis.openIncidentsBySeverity).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* KPI tiles */}
      <View style={styles.kpiRow}>
        <KpiTile
          label="Events/sec"
          value={kpis?.eventsPerSecond.toFixed(0) ?? '—'}
        />
        <KpiTile
          label="Critical"
          value={kpis?.openIncidentsBySeverity.critical ?? 0}
          accent={kpis && kpis.openIncidentsBySeverity.critical > 0 ? '#f87171' : '#e2e8f0'}
        />
        <KpiTile
          label="High"
          value={kpis?.openIncidentsBySeverity.high ?? 0}
          accent={kpis && kpis.openIncidentsBySeverity.high > 0 ? '#fb923c' : '#e2e8f0'}
        />
        <KpiTile label="Total open" value={totalOpen} />
      </View>

      {/* Severity bar chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Open incidents by severity</Text>
        {severities.map((sev) => {
          const count = kpis?.openIncidentsBySeverity[sev] ?? 0;
          const widthPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <View key={sev} style={styles.barRow}>
              <Text style={styles.barLabel}>{sev}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[styles.barFill, { width: `${widthPct}%`, backgroundColor: SEV_COLORS[sev] }]}
                />
              </View>
              <Text style={styles.barCount}>{count}</Text>
            </View>
          );
        })}
      </View>

      {/* Recent incidents */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Recent incidents</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Incidents')}>
            <Text style={styles.link}>View all</Text>
          </TouchableOpacity>
        </View>
        {recentIncidents?.items.slice(0, 5).map((inc) => (
          <View key={inc.id} style={styles.incRow}>
            <SeverityBadge value={inc.severity} />
            <View style={styles.incInfo}>
              <Text style={styles.incLabel} numberOfLines={1}>
                {inc.attackLabel.replace(/_/g, ' ')}
              </Text>
              <Text style={styles.incTime}>{formatTs(inc.detectedAt)}</Text>
            </View>
          </View>
        ))}
        {(!recentIncidents || recentIncidents.items.length === 0) && (
          <Text style={styles.empty}>No recent incidents</Text>
        )}
      </View>

      {/* Top talkers */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Top internal talkers</Text>
        {kpis?.topInternalTalkers.map((t) => (
          <View key={t.ip} style={styles.talkerRow}>
            <Text style={styles.talkerIp}>{t.ip}</Text>
            <Text style={styles.talkerBytes}>{formatBytes(t.bytes)}</Text>
          </View>
        ))}
        {(!kpis?.topInternalTalkers || kpis.topInternalTalkers.length === 0) && (
          <Text style={styles.empty}>No data</Text>
        )}
      </View>

      {/* Simulate attack */}
      <TouchableOpacity
        style={[styles.simulateBtn, seedMutation.isPending && styles.btnDisabled]}
        onPress={() => seedMutation.mutate()}
        disabled={seedMutation.isPending}
        testID="simulate-attack-btn"
      >
        {seedMutation.isPending
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.simulateBtnText}>Simulate Attack</Text>
        }
      </TouchableOpacity>

      {/* Threat map placeholder */}
      <View style={[styles.card, styles.placeholderCard]}>
        <Text style={styles.placeholderText}>Threat Map — requires device build</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f172a' },
  content:        { padding: 16, gap: 16 },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  kpiRow:         { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  kpiTile:        { flex: 1, minWidth: '45%', backgroundColor: '#1e293b', borderRadius: 10, padding: 14 },
  kpiLabel:       { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue:       { fontSize: 26, fontWeight: '700', marginTop: 4 },
  card:           { backgroundColor: '#1e293b', borderRadius: 10, padding: 16, gap: 10 },
  cardTitle:      { fontSize: 13, fontWeight: '600', color: '#cbd5e1' },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link:           { fontSize: 12, color: '#818cf8' },
  barRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel:       { width: 56, fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' },
  barTrack:       { flex: 1, height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden' },
  barFill:        { height: 8, borderRadius: 4 },
  barCount:       { width: 28, fontSize: 12, color: '#94a3b8', textAlign: 'right' },
  incRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  incInfo:        { flex: 1 },
  incLabel:       { fontSize: 13, color: '#e2e8f0', textTransform: 'capitalize' },
  incTime:        { fontSize: 11, color: '#64748b', marginTop: 2 },
  empty:          { fontSize: 13, color: '#64748b', textAlign: 'center', paddingVertical: 4 },
  talkerRow:      { flexDirection: 'row', justifyContent: 'space-between' },
  talkerIp:       { fontFamily: 'monospace', fontSize: 13, color: '#cbd5e1' },
  talkerBytes:    { fontSize: 13, color: '#94a3b8' },
  placeholderCard:  { alignItems: 'center', paddingVertical: 24, borderStyle: 'dashed', borderWidth: 1, borderColor: '#334155' },
  placeholderText:  { color: '#475569', fontSize: 13 },
  simulateBtn:      { backgroundColor: '#dc2626', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnDisabled:      { opacity: 0.6 },
  simulateBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});
