import { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { qk } from '../lib/query-keys';
import { apiClient } from '../lib/api-client';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';
import type { IncidentList, Severity, IncidentStatus } from '@netvigil/shared-types';
import type { IncidentsStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<IncidentsStackParamList, 'IncidentsList'>;

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const STATUSES: IncidentStatus[] = ['open', 'acknowledged', 'confirmed', 'false_positive'];

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open:           'Open',
  acknowledged:   'Ack',
  confirmed:      'Confirmed',
  false_positive: 'FP',
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZE = 10;

export default function IncidentsScreen({ navigation }: Props) {
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [status,   setStatus]   = useState<IncidentStatus | ''>('');
  const [page,     setPage]     = useState(1);

  const filters = { severity, status, page, pageSize: PAGE_SIZE };

  const { data, isLoading } = useQuery({
    queryKey: qk.incidents.list(filters),
    queryFn: () => {
      const parts = [`page=${String(page)}`, `pageSize=${String(PAGE_SIZE)}`];
      if (severity) parts.push(`severity=${severity}`);
      if (status)   parts.push(`status=${status}`);
      return apiClient.get<IncidentList>(`/incidents?${parts.join('&')}`);
    },
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <View style={styles.container}>
      {/* Severity chips */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.chip, severity === '' && styles.chipActive]}
          onPress={() => { setSeverity(''); setPage(1); }}
        >
          <Text style={[styles.chipText, severity === '' && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {SEVERITIES.map((sev) => (
          <TouchableOpacity
            key={sev}
            style={[styles.chip, severity === sev && styles.chipActive]}
            onPress={() => { setSeverity(sev); setPage(1); }}
          >
            <Text style={[styles.chipText, severity === sev && styles.chipTextActive]}>
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Status chips */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.chip, status === '' && styles.chipActive]}
          onPress={() => { setStatus(''); setPage(1); }}
        >
          <Text style={[styles.chipText, status === '' && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {STATUSES.map((st) => (
          <TouchableOpacity
            key={st}
            style={[styles.chip, status === st && styles.chipActive]}
            onPress={() => { setStatus(st); setPage(1); }}
          >
            <Text style={[styles.chipText, status === st && styles.chipTextActive]}>
              {STATUS_LABELS[st]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      )}

      {!isLoading && data?.items.length === 0 && (
        <Text style={styles.empty}>No incidents match the current filters.</Text>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <FlatList
          data={data.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('IncidentDetail', { id: item.id })}
            >
              <View style={styles.rowTop}>
                <SeverityBadge value={item.severity} />
                <Text style={styles.rowTime}>{formatTs(item.detectedAt)}</Text>
              </View>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {item.attackLabel.replace(/_/g, ' ')}
              </Text>
              <View style={styles.rowBottom}>
                <Text style={styles.rowMitre}>{item.mitreTechnique}</Text>
                <StatusBadge value={item.status} />
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
                  disabled={page === 1}
                  onPress={() => setPage((p) => p - 1)}
                >
                  <Text style={styles.pageBtnText}>Prev</Text>
                </TouchableOpacity>
                <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
                <TouchableOpacity
                  style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
                  disabled={page === totalPages}
                  onPress={() => setPage((p) => p + 1)}
                >
                  <Text style={styles.pageBtnText}>Next</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0f172a' },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow:       { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 10, gap: 6 },
  chip:            { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  chipActive:      { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipText:        { fontSize: 12, color: '#94a3b8' },
  chipTextActive:  { color: '#fff', fontWeight: '600' },
  list:            { padding: 12, gap: 8 },
  row:             { backgroundColor: '#1e293b', borderRadius: 10, padding: 14, gap: 8 },
  rowTop:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTime:         { fontSize: 11, color: '#64748b' },
  rowLabel:        { fontSize: 14, color: '#e2e8f0', textTransform: 'capitalize' },
  rowBottom:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowMitre:        { fontSize: 11, fontFamily: 'monospace', color: '#818cf8' },
  empty:           { textAlign: 'center', color: '#64748b', margin: 24 },
  pagination:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  pageBtn:         { backgroundColor: '#1e293b', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText:     { color: '#e2e8f0', fontSize: 13 },
  pageText:        { color: '#64748b', fontSize: 13 },
});
