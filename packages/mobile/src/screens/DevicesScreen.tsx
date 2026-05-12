import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { qk } from '../lib/query-keys';
import { apiClient } from '../lib/api-client';
import type { DeviceList } from '@aankhanet/shared-types';

const FIVE_MIN_MS = 5 * 60 * 1000;

function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < FIVE_MIN_MS;
}

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function DevicesScreen() {
  const { data, isLoading } = useQuery({
    queryKey: qk.devices.list(),
    queryFn:  () => apiClient.get<DeviceList>('/devices'),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={data?.items ?? []}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>No devices registered.</Text>}
      renderItem={({ item }) => {
        const online = isOnline(item.lastSeenAt);
        return (
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: online ? '#4ade80' : '#475569' }]} />
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.ip}>{item.publicIp}</Text>
              <Text style={styles.meta}>
                {item.vendor.replace('_', ' ')} · {item.protocol.toUpperCase()}
              </Text>
              <Text style={styles.lastSeen}>Last seen: {formatLastSeen(item.lastSeenAt)}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: online ? '#14532d' : '#1e293b' }]}>
              <Text style={[styles.pillText, { color: online ? '#4ade80' : '#64748b' }]}>
                {online ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content:   { padding: 12, gap: 8 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  empty:     { textAlign: 'center', color: '#64748b', marginTop: 40 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1e293b', borderRadius: 10, padding: 14 },
  dot:       { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  info:      { flex: 1, gap: 2 },
  name:      { fontSize: 14, fontWeight: '600', color: '#e2e8f0' },
  ip:        { fontSize: 12, fontFamily: 'monospace', color: '#94a3b8' },
  meta:      { fontSize: 11, color: '#64748b', textTransform: 'capitalize' },
  lastSeen:  { fontSize: 11, color: '#475569' },
  pill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexShrink: 0 },
  pillText:  { fontSize: 12, fontWeight: '600' },
});
