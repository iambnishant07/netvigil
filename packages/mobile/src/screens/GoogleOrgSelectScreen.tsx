import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView, TextInput,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/auth-context';
import { apiClient } from '../lib/api-client';
import type { AuthResponse } from '@aankhanet/shared-types';
import type { AuthStackParamList } from '../navigation/AuthNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'GoogleOrgSelect'>;

interface OrgOption { id: string; name: string; }

const ROLES = [
  { value: 'admin',                 label: 'Admin'                 },
  { value: 'senior_analyst',        label: 'Senior Analyst'        },
  { value: 'analyst',               label: 'Analyst'               },
  { value: 'threat_hunter',         label: 'Threat Hunter'         },
  { value: 'forensic_investigator', label: 'Forensic Investigator' },
  { value: 'auditor',               label: 'Auditor'               },
  { value: 'developer',             label: 'Developer'             },
];

export default function GoogleOrgSelectScreen({ route, navigation }: Props) {
  const { googleSessionToken, email } = route.params;
  const { login } = useAuth();

  const [mode, setMode]                   = useState<'join' | 'create'>('join');
  const [orgId, setOrgId]                 = useState('');
  const [orgName, setOrgName]             = useState('');
  const [role, setRole]                   = useState('analyst');
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const { data: orgs } = useQuery<OrgOption[]>({
    queryKey: ['orgs', 'list'],
    queryFn:  () => apiClient.get<OrgOption[]>('/auth/organizations'),
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiClient.post<AuthResponse>('/auth/google/complete', body),
    onSuccess: async (data) => {
      await login(data);
    },
    onError: (err: Error) => {
      Alert.alert('Setup failed', err.message);
    },
  });

  function handleSubmit() {
    if (mode === 'join' && !orgId) {
      Alert.alert('Select an organisation', 'Please choose an organisation to join.');
      return;
    }
    if (mode === 'create' && !orgName.trim()) {
      Alert.alert('Organisation name required', 'Enter a name for your new organisation.');
      return;
    }
    const body: Record<string, string> = { googleSessionToken, role };
    if (mode === 'create') {
      body['organizationName'] = orgName.trim();
    } else {
      body['organizationId'] = orgId;
    }
    mutation.mutate(body);
  }

  const selectedRoleLabel = ROLES.find((r) => r.value === role)?.label ?? role;
  const selectedOrgLabel  = (orgs ?? []).find((o) => o.id === orgId)?.name ?? 'Select an organisation…';

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>One more step</Text>
        <Text style={s.subtitle}>
          Signing in as <Text style={s.emailHighlight}>{email}</Text>
        </Text>
        <Text style={s.subtitle}>Choose your organisation and role to continue.</Text>

        {/* Mode toggle */}
        <View style={s.modeRow}>
          <TouchableOpacity
            style={[s.modeBtn, mode === 'join' && s.modeBtnActive]}
            onPress={() => setMode('join')}
          >
            <Text style={[s.modeBtnText, mode === 'join' && s.modeBtnTextActive]}>Join org</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeBtn, mode === 'create' && s.modeBtnActive]}
            onPress={() => setMode('create')}
          >
            <Text style={[s.modeBtnText, mode === 'create' && s.modeBtnTextActive]}>Create org</Text>
          </TouchableOpacity>
        </View>

        {mode === 'create' ? (
          <View style={s.field}>
            <Text style={s.label}>Organisation name</Text>
            <TextInput
              style={s.input}
              value={orgName}
              onChangeText={setOrgName}
              placeholder="Acme Pty Ltd"
              placeholderTextColor="#475569"
              autoCapitalize="words"
            />
          </View>
        ) : (
          <>
            <View style={s.field}>
              <Text style={s.label}>Organisation</Text>
              <TouchableOpacity
                style={[s.input, s.picker]}
                onPress={() => setOrgPickerOpen(!orgPickerOpen)}
              >
                <Text style={orgId ? s.pickerValue : s.pickerPlaceholder}>{selectedOrgLabel}</Text>
                <Text style={s.pickerChevron}>{orgPickerOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {orgPickerOpen && (
                <View style={s.dropdown}>
                  {(orgs ?? []).map((o) => (
                    <TouchableOpacity
                      key={o.id}
                      style={s.dropdownItem}
                      onPress={() => { setOrgId(o.id); setOrgPickerOpen(false); }}
                    >
                      <Text style={[s.dropdownText, orgId === o.id && s.dropdownTextActive]}>
                        {o.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={s.field}>
              <Text style={s.label}>Role</Text>
              <TouchableOpacity
                style={[s.input, s.picker]}
                onPress={() => setRolePickerOpen(!rolePickerOpen)}
              >
                <Text style={s.pickerValue}>{selectedRoleLabel}</Text>
                <Text style={s.pickerChevron}>{rolePickerOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {rolePickerOpen && (
                <View style={s.dropdown}>
                  {ROLES.map((r) => (
                    <TouchableOpacity
                      key={r.value}
                      style={s.dropdownItem}
                      onPress={() => { setRole(r.value); setRolePickerOpen(false); }}
                    >
                      <Text style={[s.dropdownText, role === r.value && s.dropdownTextActive]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={s.notice}>
              <Text style={s.noticeText}>Joining requires admin approval before you can access data.</Text>
            </View>
          </>
        )}

        <TouchableOpacity
          style={[s.btn, mutation.isPending && s.btnDisabled]}
          onPress={handleSubmit}
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>{mode === 'create' ? 'Create & continue' : 'Request access'}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#0f172a' },
  inner:             { paddingHorizontal: 24, paddingVertical: 48, gap: 16 },
  title:             { fontSize: 22, fontWeight: '700', color: '#e2e8f0', textAlign: 'center' },
  subtitle:          { fontSize: 13, color: '#64748b', textAlign: 'center' },
  emailHighlight:    { color: '#818cf8', fontWeight: '600' },
  modeRow:           { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  modeBtn:           { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#1e293b' },
  modeBtnActive:     { backgroundColor: '#6366f1' },
  modeBtnText:       { fontSize: 13, fontWeight: '600', color: '#64748b' },
  modeBtnTextActive: { color: '#fff' },
  field:             { gap: 4 },
  label:             { fontSize: 13, fontWeight: '600', color: '#cbd5e1' },
  input:             { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#e2e8f0', fontSize: 15 },
  picker:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerValue:       { color: '#e2e8f0', fontSize: 15 },
  pickerPlaceholder: { color: '#475569', fontSize: 15 },
  pickerChevron:     { color: '#64748b', fontSize: 12 },
  dropdown:          { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, marginTop: 2, zIndex: 10 },
  dropdownItem:      { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  dropdownText:      { color: '#94a3b8', fontSize: 14 },
  dropdownTextActive:{ color: '#818cf8', fontWeight: '600' },
  notice:            { backgroundColor: '#451a0320', borderWidth: 1, borderColor: '#92400e', borderRadius: 8, padding: 10 },
  noticeText:        { fontSize: 12, color: '#fbbf24', lineHeight: 18 },
  btn:               { backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  btnDisabled:       { opacity: 0.6 },
  btnText:           { color: '#fff', fontWeight: '700', fontSize: 15 },
  back:              { alignItems: 'center', paddingTop: 4 },
  backText:          { color: '#64748b', fontSize: 14 },
});
