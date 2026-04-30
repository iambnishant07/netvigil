import { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Switch, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../lib/query-keys';
import { apiClient } from '../lib/api-client';
import SeverityBadge from '../components/SeverityBadge';
import type { AlertRule, AlertRuleCreate, Severity, AlertChannel } from '@netvigil/shared-types';

const SEVERITIES: Severity[]     = ['critical', 'high', 'medium', 'low', 'info'];
const CHANNELS: AlertChannel[]   = ['email', 'sms', 'push'];

const CHANNEL_ICONS: Record<AlertChannel, string> = {
  email: '✉️',
  sms:   '📱',
  push:  '🔔',
};

export default function AlertRulesScreen() {
  const queryClient = useQueryClient();
  const [showForm,    setShowForm]    = useState(false);
  const [name,        setName]        = useState('');
  const [minSeverity, setMinSeverity] = useState<Severity>('high');
  const [channel,     setChannel]     = useState<AlertChannel>('email');
  const [nameErr,     setNameErr]     = useState('');

  const { data: rules, isLoading } = useQuery({
    queryKey: qk.alertRules.list(),
    queryFn:  () => apiClient.get<AlertRule[]>('/alert-rules'),
  });

  const createMutation = useMutation({
    mutationFn: (body: AlertRuleCreate) => apiClient.post<AlertRule>('/alert-rules', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.alertRules.list() });
      setShowForm(false);
      setName('');
      setNameErr('');
    },
    onError: (err: Error) => Alert.alert('Create failed', err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.patch<AlertRule>(`/alert-rules/${id}`, { enabled }),
    onSuccess: (updated) => {
      queryClient.setQueryData<AlertRule[]>(qk.alertRules.list(), (prev) =>
        prev?.map((r) => (r.id === updated.id ? updated : r)),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/alert-rules/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.alertRules.list() });
    },
  });

  function handleCreate() {
    if (!name.trim()) {
      setNameErr('Name is required');
      return;
    }
    setNameErr('');
    createMutation.mutate({ name: name.trim(), minSeverity, channel, enabled: true });
  }

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
      data={rules ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowForm((v) => !v)}>
            <Text style={styles.createBtnText}>{showForm ? 'Cancel' : '+ Create rule'}</Text>
          </TouchableOpacity>

          {showForm && (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>Rule name</Text>
              <TextInput
                style={[styles.input, nameErr ? styles.inputError : null]}
                value={name}
                onChangeText={setName}
                placeholder="High severity to email"
                placeholderTextColor="#475569"
              />
              {!!nameErr && <Text style={styles.errorText}>{nameErr}</Text>}

              <Text style={styles.fieldLabel}>Min severity</Text>
              <View style={styles.chipRow}>
                {SEVERITIES.map((sev) => (
                  <TouchableOpacity
                    key={sev}
                    style={[styles.chip, minSeverity === sev && styles.chipActive]}
                    onPress={() => setMinSeverity(sev)}
                  >
                    <Text style={[styles.chipText, minSeverity === sev && styles.chipTextActive]}>
                      {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Channel</Text>
              <View style={styles.chipRow}>
                {CHANNELS.map((ch) => (
                  <TouchableOpacity
                    key={ch}
                    style={[styles.chip, channel === ch && styles.chipActive]}
                    onPress={() => setChannel(ch)}
                  >
                    <Text style={[styles.chipText, channel === ch && styles.chipTextActive]}>
                      {CHANNEL_ICONS[ch]} {ch.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, createMutation.isPending && styles.submitBtnDisabled]}
                onPress={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitBtnText}>Create rule</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        !showForm ? <Text style={styles.empty}>No alert rules yet.</Text> : null
      }
      renderItem={({ item }) => (
        <View style={[styles.ruleRow, !item.enabled && styles.ruleRowDisabled]}>
          <Text style={styles.ruleIcon}>{CHANNEL_ICONS[item.channel]}</Text>
          <View style={styles.ruleInfo}>
            <Text style={styles.ruleName}>{item.name}</Text>
            <View style={styles.ruleBadges}>
              <SeverityBadge value={item.minSeverity} />
              <Text style={styles.ruleChannel}>{item.channel.toUpperCase()}</Text>
            </View>
          </View>
          <Switch
            value={item.enabled}
            onValueChange={(v) => toggleMutation.mutate({ id: item.id, enabled: v })}
            trackColor={{ false: '#334155', true: '#4f46e5' }}
            thumbColor="#fff"
          />
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Delete rule', `Delete "${item.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
              ]);
            }}
          >
            <Text style={styles.deleteBtn}>🗑</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0f172a' },
  content:            { padding: 16, gap: 10 },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  header:             { gap: 12, marginBottom: 4 },
  createBtn:          { alignSelf: 'flex-start', backgroundColor: '#4f46e5', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText:      { color: '#fff', fontWeight: '600' },
  form:               { backgroundColor: '#1e293b', borderRadius: 10, padding: 16, gap: 10 },
  fieldLabel:         { fontSize: 13, fontWeight: '600', color: '#cbd5e1' },
  input:              { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#e2e8f0' },
  inputError:         { borderColor: '#f87171' },
  errorText:          { fontSize: 12, color: '#f87171' },
  chipRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:               { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  chipActive:         { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipText:           { fontSize: 13, color: '#94a3b8' },
  chipTextActive:     { color: '#fff', fontWeight: '600' },
  submitBtn:          { backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitBtnDisabled:  { opacity: 0.6 },
  submitBtnText:      { color: '#fff', fontWeight: '700' },
  empty:              { textAlign: 'center', color: '#64748b', marginTop: 20 },
  ruleRow:            { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1e293b', borderRadius: 10, padding: 14 },
  ruleRowDisabled:    { opacity: 0.5 },
  ruleIcon:           { fontSize: 18 },
  ruleInfo:           { flex: 1, gap: 6 },
  ruleName:           { fontSize: 14, fontWeight: '600', color: '#e2e8f0' },
  ruleBadges:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleChannel:        { fontSize: 11, color: '#94a3b8', backgroundColor: '#334155', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  deleteBtn:          { fontSize: 18, padding: 4 },
});
