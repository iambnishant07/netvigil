import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/auth-context';
import { apiClient } from '../lib/api-client';
import type { AuthResponse } from '@netvigil/shared-types';
import type { AuthStackParamList } from '../navigation/AuthNavigator';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] ?? '';
const API_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? '').replace(/\/api\/v1$/, '');

const ROLES = [
  { value: 'admin',                 label: 'Admin'                 },
  { value: 'senior_analyst',        label: 'Senior Analyst'        },
  { value: 'analyst',               label: 'Analyst'               },
  { value: 'threat_hunter',         label: 'Threat Hunter'         },
  { value: 'forensic_investigator', label: 'Forensic Investigator' },
  { value: 'auditor',               label: 'Auditor'               },
  { value: 'developer',             label: 'Developer'             },
];

type Mode = 'join' | 'create';
type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

interface OrgOption { id: string; name: string; }

export default function RegisterScreen({ navigation }: Props) {
  const [mode,         setMode]         = useState<Mode>('join');
  const [orgName,      setOrgName]      = useState('');
  const [orgId,        setOrgId]        = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [timezone,     setTimezone]     = useState('Australia/Melbourne');
  const [role,         setRole]         = useState('analyst');
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [orgPickerOpen,  setOrgPickerOpen]  = useState(false);
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [googleLoading, setGoogleLoading] = useState(false);

  const { login } = useAuth();

  const { data: orgs } = useQuery<OrgOption[]>({
    queryKey: ['orgs', 'list'],
    queryFn:  () => apiClient.get<OrgOption[]>('/auth/organizations'),
  });

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_URL}/api/v1/auth/google/mobile`,
        'netvigil://',
      );
      if (result.type !== 'success') return;
      const pairs = result.url.replace(/^[^?]*\?/, '').split('&');
      const qp = (k: string) => { const e = pairs.find(s => s.startsWith(`${k}=`)); return e ? decodeURIComponent(e.slice(k.length + 1)) : ''; };
      const err = qp('error');
      if (err) { Alert.alert('Google sign-in failed', err); return; }
      await login({
        accessToken:  qp('access_token'),
        refreshToken: qp('refresh_token'),
        expiresIn:    parseInt(qp('expires_in') || '900', 10),
        user: {
          id:             qp('user_id'),
          organizationId: qp('org_id'),
          email:          qp('email'),
          role:   (qp('role') || 'admin') as import('@netvigil/shared-types').UserRole,
          status: (qp('status') || 'active') as import('@netvigil/shared-types').UserStatus,
          mfaEnrolled:    qp('mfa_enrolled') === 'true',
          createdAt:      qp('created_at') || new Date().toISOString(),
        },
        mfaRequired: false,
      });
    } catch (e: unknown) {
      Alert.alert('Google sign-in failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGoogleLoading(false);
    }
  }

  const mutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiClient.post<AuthResponse>('/auth/register', body),
    onSuccess: async (data) => {
      await login(data);
    },
    onError: (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes('email') || msg.includes('taken')) {
        setErrors({ email: 'This email is already registered' });
      } else {
        Alert.alert('Registration failed', err.message);
      }
    },
  });

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (mode === 'create') {
      if (!orgName.trim() || orgName.trim().length < 2) errs['orgName'] = 'Organisation name must be at least 2 characters';
    } else {
      if (!orgId) errs['orgId'] = 'Select an organisation';
    }
    if (!email.includes('@')) errs['email']    = 'Enter a valid email address';
    if (password.length < 12)  errs['password'] = 'Password must be at least 12 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    if (mode === 'create') {
      mutation.mutate({ organizationName: orgName.trim(), email: email.trim(), password, timezone });
    } else {
      mutation.mutate({ organizationId: orgId, email: email.trim(), password, role });
    }
  }

  const selectedRoleLabel = ROLES.find(r => r.value === role)?.label ?? role;
  const selectedOrgName   = (orgs ?? []).find(o => o.id === orgId)?.name ?? 'Select an organisation…';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create an account</Text>
        <Text style={styles.subtitle}>NetVigil — AI-driven network threat detection</Text>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'join' && styles.modeBtnActive]}
            onPress={() => setMode('join')}
          >
            <Text style={[styles.modeBtnText, mode === 'join' && styles.modeBtnTextActive]}>
              Join org
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'create' && styles.modeBtnActive]}
            onPress={() => setMode('create')}
          >
            <Text style={[styles.modeBtnText, mode === 'create' && styles.modeBtnTextActive]}>
              Create org
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'create' ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Organisation name</Text>
              <TextInput
                style={[styles.input, errors['orgName'] ? styles.inputError : null]}
                value={orgName}
                onChangeText={setOrgName}
                placeholder="Acme Pty Ltd"
                placeholderTextColor="#475569"
                autoCapitalize="words"
              />
              {!!errors['orgName'] && <Text style={styles.errorText}>{errors['orgName']}</Text>}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Timezone</Text>
              <TextInput
                style={styles.input}
                value={timezone}
                onChangeText={setTimezone}
                placeholder="Australia/Melbourne"
                placeholderTextColor="#475569"
                autoCapitalize="none"
              />
              <Text style={styles.hint}>e.g. Australia/Sydney, Australia/Perth, UTC</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Organisation</Text>
              <TouchableOpacity
                style={[styles.input, styles.picker, errors['orgId'] ? styles.inputError : null]}
                onPress={() => setOrgPickerOpen(!orgPickerOpen)}
              >
                <Text style={orgId ? styles.pickerValue : styles.pickerPlaceholder}>
                  {selectedOrgName}
                </Text>
                <Text style={styles.pickerChevron}>{orgPickerOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {orgPickerOpen && (
                <View style={styles.dropdown}>
                  {(orgs ?? []).map(o => (
                    <TouchableOpacity
                      key={o.id}
                      style={styles.dropdownItem}
                      onPress={() => { setOrgId(o.id); setOrgPickerOpen(false); }}
                    >
                      <Text style={[styles.dropdownText, orgId === o.id && styles.dropdownTextActive]}>
                        {o.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!!errors['orgId'] && <Text style={styles.errorText}>{errors['orgId']}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Role</Text>
              <TouchableOpacity
                style={[styles.input, styles.picker]}
                onPress={() => setRolePickerOpen(!rolePickerOpen)}
              >
                <Text style={styles.pickerValue}>{selectedRoleLabel}</Text>
                <Text style={styles.pickerChevron}>{rolePickerOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {rolePickerOpen && (
                <View style={styles.dropdown}>
                  {ROLES.map(r => (
                    <TouchableOpacity
                      key={r.value}
                      style={styles.dropdownItem}
                      onPress={() => { setRole(r.value); setRolePickerOpen(false); }}
                    >
                      <Text style={[styles.dropdownText, role === r.value && styles.dropdownTextActive]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.pendingNotice}>
              <Text style={styles.pendingNoticeText}>
                Joining requires admin approval before you can access data.
              </Text>
            </View>
          </>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors['email'] ? styles.inputError : null]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor="#475569"
          />
          {!!errors['email'] && <Text style={styles.errorText}>{errors['email']}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, errors['password'] ? styles.inputError : null]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="Minimum 12 characters"
            placeholderTextColor="#475569"
          />
          {!!errors['password'] && <Text style={styles.errorText}>{errors['password']}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.btn, mutation.isPending && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>{mode === 'create' ? 'Create account' : 'Request access'}</Text>
          }
        </TouchableOpacity>

        {!!GOOGLE_CLIENT_ID && (
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
            onPress={() => void handleGoogleSignIn()}
            disabled={googleLoading}
          >
            {googleLoading
              ? <ActivityIndicator color="#e2e8f0" />
              : <Text style={styles.googleBtnText}>🔵  Continue with Google</Text>
            }
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.switchLink} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.switchText}>Already have an account? <Text style={styles.switchAction}>Sign in</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#0f172a' },
  inner:                { paddingHorizontal: 24, paddingVertical: 48, gap: 16 },
  title:                { fontSize: 22, fontWeight: '700', color: '#e2e8f0', textAlign: 'center' },
  subtitle:             { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 4 },
  modeRow:              { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  modeBtn:              { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#1e293b' },
  modeBtnActive:        { backgroundColor: '#6366f1' },
  modeBtnText:          { fontSize: 13, fontWeight: '600', color: '#64748b' },
  modeBtnTextActive:    { color: '#fff' },
  field:                { gap: 4 },
  label:                { fontSize: 13, fontWeight: '600', color: '#cbd5e1' },
  input:                { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#e2e8f0', fontSize: 15 },
  inputError:           { borderColor: '#f87171' },
  errorText:            { fontSize: 12, color: '#f87171' },
  hint:                 { fontSize: 11, color: '#475569' },
  picker:               { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerValue:          { color: '#e2e8f0', fontSize: 15 },
  pickerPlaceholder:    { color: '#475569', fontSize: 15 },
  pickerChevron:        { color: '#64748b', fontSize: 12 },
  dropdown:             { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, marginTop: 2, zIndex: 10 },
  dropdownItem:         { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  dropdownText:         { color: '#94a3b8', fontSize: 14 },
  dropdownTextActive:   { color: '#818cf8', fontWeight: '600' },
  pendingNotice:        { backgroundColor: '#451a0320', borderWidth: 1, borderColor: '#92400e', borderRadius: 8, padding: 10 },
  pendingNoticeText:    { fontSize: 12, color: '#fbbf24', lineHeight: 18 },
  btn:                  { backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  btnDisabled:          { opacity: 0.6 },
  btnText:              { color: '#fff', fontWeight: '700', fontSize: 15 },
  googleBtn:            { backgroundColor: '#1e293b', borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  googleBtnText:        { color: '#e2e8f0', fontWeight: '600', fontSize: 14 },
  switchLink:           { alignItems: 'center', paddingTop: 8 },
  switchText:           { color: '#64748b', fontSize: 14 },
  switchAction:         { color: '#818cf8', fontWeight: '600' },
});
