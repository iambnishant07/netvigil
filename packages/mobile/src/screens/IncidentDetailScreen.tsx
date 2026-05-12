import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { qk } from '../lib/query-keys';
import { apiClient } from '../lib/api-client';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';
import type { Incident, IncidentStatus, Severity } from '@aankhanet/shared-types';
import type { IncidentsStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<IncidentsStackParamList, 'IncidentDetail'>;

const STATUSES: { value: IncidentStatus; label: string }[] = [
  { value: 'open',           label: 'Open'           },
  { value: 'acknowledged',   label: 'Acknowledged'   },
  { value: 'confirmed',      label: 'Confirmed'      },
  { value: 'false_positive', label: 'False positive' },
];

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High'     },
  { value: 'medium',   label: 'Medium'   },
  { value: 'low',      label: 'Low'      },
  { value: 'info',     label: 'Info'     },
];

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function IncidentDetailScreen({ route }: Props) {
  const { id } = route.params;
  const queryClient = useQueryClient();

  const [selectedStatus,   setSelectedStatus]   = useState<IncidentStatus | ''>('');
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | ''>('');
  const [narrative,        setNarrative]        = useState('');

  const { data: incident, isLoading, isError } = useQuery({
    queryKey: qk.incidents.detail(id),
    queryFn:  () => apiClient.get<Incident>(`/incidents/${id}`),
  });

  useEffect(() => {
    if (incident) {
      setSelectedStatus(incident.status as IncidentStatus);
      setSelectedSeverity(incident.severity as Severity);
      setNarrative(incident.narrative ?? '');
    }
  }, [incident]);

  const updateMutation = useMutation({
    mutationFn: (body: { status?: IncidentStatus; severity?: Severity; narrative?: string }) =>
      apiClient.patch<Incident>(`/incidents/${id}`, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.incidents.detail(id), updated);
      Alert.alert('Saved', 'Incident updated successfully.');
    },
    onError: (err: Error) => {
      Alert.alert('Update failed', err.message);
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (isError || !incident) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorMsg}>Incident not found or failed to load.</Text>
      </View>
    );
  }

  const isDirty =
    selectedStatus   !== incident.status ||
    selectedSeverity !== incident.severity ||
    narrative        !== (incident.narrative ?? '');

  function handleSave() {
    if (!incident) return;
    const body: Record<string, string> = {};
    if (selectedStatus   && selectedStatus   !== incident.status)   body['status']    = selectedStatus;
    if (selectedSeverity && selectedSeverity !== incident.severity) body['severity']  = selectedSeverity;
    if (narrative !== (incident.narrative ?? ''))                   body['narrative'] = narrative;
    if (Object.keys(body).length === 0) return;
    updateMutation.mutate(body as Parameters<typeof updateMutation.mutate>[0]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <SeverityBadge value={incident.severity} />
        <Text style={styles.mitre}>{incident.mitreTechnique}</Text>
        <StatusBadge value={incident.status} />
      </View>
      <Text style={styles.title}>{incident.attackLabel.replace(/_/g, ' ')}</Text>

      {/* Detail grid */}
      <View style={styles.card}>
        <DetailRow label="Detected at"    value={formatTs(incident.detectedAt)} />
        <DetailRow label="Source IP"      value={incident.sourceIp} />
        <DetailRow label="Destination IP" value={incident.destinationIp} />
        <DetailRow label="Anomaly score"  value={`${(incident.anomalyScore * 100).toFixed(1)}%`} />
      </View>

      {/* AI narrative (read-only display) */}
      {incident.narrative && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI Narrative</Text>
          <Text style={styles.narrativeText}>{incident.narrative}</Text>
          <Text style={styles.disclaimer}>Generated by Claude — verify before acting.</Text>
        </View>
      )}

      {/* Edit form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Edit incident</Text>

        <Text style={styles.fieldLabel}>Status</Text>
        <View style={styles.chipRow}>
          {STATUSES.map((s) => (
            <TouchableOpacity
              key={s.value}
              style={[styles.chip, selectedStatus === s.value && styles.chipActive]}
              onPress={() => setSelectedStatus(s.value)}
            >
              <Text style={[styles.chipText, selectedStatus === s.value && styles.chipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Severity</Text>
        <View style={styles.chipRow}>
          {SEVERITIES.map((sev) => (
            <TouchableOpacity
              key={sev.value}
              style={[styles.chip, selectedSeverity === sev.value && styles.chipActive]}
              onPress={() => setSelectedSeverity(sev.value)}
            >
              <Text style={[styles.chipText, selectedSeverity === sev.value && styles.chipTextActive]}>
                {sev.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Analyst note / narrative</Text>
        <TextInput
          style={styles.noteInput}
          value={narrative}
          onChangeText={setNarrative}
          placeholder="Describe what happened and recommended action…"
          placeholderTextColor="#475569"
          multiline
          numberOfLines={4}
          maxLength={4000}
        />

        {updateMutation.isError && (
          <Text style={styles.errorMsg}>{(updateMutation.error as Error).message}</Text>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, (!isDirty || updateMutation.isPending) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!isDirty || updateMutation.isPending}
        >
          {updateMutation.isPending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveBtnText}>Save changes</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#0f172a' },
  content:              { padding: 16, gap: 16 },
  center:               { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  errorMsg:             { color: '#f87171', fontSize: 14 },
  headerRow:            { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  mitre:                { fontFamily: 'monospace', fontSize: 12, color: '#818cf8', backgroundColor: '#1e293b', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  title:                { fontSize: 18, fontWeight: '600', color: '#e2e8f0', textTransform: 'capitalize' },
  card:                 { backgroundColor: '#1e293b', borderRadius: 10, padding: 16, gap: 12 },
  cardTitle:            { fontSize: 13, fontWeight: '600', color: '#cbd5e1' },
  detailRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  detailLabel:          { fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue:          { fontSize: 13, color: '#e2e8f0', textAlign: 'right', flex: 1, paddingLeft: 8 },
  narrativeText:        { fontSize: 13, color: '#cbd5e1', lineHeight: 20 },
  disclaimer:           { fontSize: 11, color: '#475569' },
  fieldLabel:           { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  chipRow:              { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:                 { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  chipActive:           { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipText:             { fontSize: 13, color: '#94a3b8' },
  chipTextActive:       { color: '#fff', fontWeight: '600' },
  noteInput:            { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#e2e8f0', fontSize: 14, textAlignVertical: 'top', minHeight: 100 },
  saveBtn:              { backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  saveBtnDisabled:      { opacity: 0.5 },
  saveBtnText:          { color: '#fff', fontWeight: '700', fontSize: 15 },
});
