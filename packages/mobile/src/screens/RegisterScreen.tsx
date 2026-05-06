import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/auth-context';
import { apiClient } from '../lib/api-client';
import type { AuthResponse } from '@netvigil/shared-types';
import type { AuthStackParamList } from '../navigation/AuthNavigator';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] ?? '';
const API_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? '').replace(/\/api\/v1$/, '');

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const [orgName,       setOrgName]       = useState('');
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [timezone,      setTimezone]      = useState('Australia/Melbourne');
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [googleLoading, setGoogleLoading] = useState(false);

  const { login } = useAuth();

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
          role:           (qp('role') || 'admin') as 'admin' | 'analyst' | 'viewer',
          mfaEnrolled:    qp('mfa_enrolled') === 'true',
          createdAt:      qp('created_at') || new Date().toISOString(),
        },
      });
    } catch (e: unknown) {
      Alert.alert('Google sign-in failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGoogleLoading(false);
    }
  }

  const mutation = useMutation({
    mutationFn: (data: { organization_name: string; email: string; password: string; timezone: string }) =>
      apiClient.post<AuthResponse>('/auth/register', data),
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
    if (!orgName.trim())          errs['orgName']  = 'Organisation name is required';
    if (!email.includes('@'))     errs['email']    = 'Enter a valid email address';
    if (password.length < 12)     errs['password'] = 'Password must be at least 12 characters';
    if (!timezone.trim())         errs['timezone'] = 'Timezone is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({
      organization_name: orgName.trim(),
      email:    email.trim(),
      password,
      timezone: timezone.trim(),
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>NetVigil — AI-driven network threat detection</Text>

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

        <View style={styles.field}>
          <Text style={styles.label}>Timezone</Text>
          <TextInput
            style={[styles.input, errors['timezone'] ? styles.inputError : null]}
            value={timezone}
            onChangeText={setTimezone}
            placeholder="Australia/Melbourne"
            placeholderTextColor="#475569"
            autoCapitalize="none"
          />
          {!!errors['timezone'] && <Text style={styles.errorText}>{errors['timezone']}</Text>}
          <Text style={styles.hint}>e.g. Australia/Sydney, Australia/Perth, UTC</Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, mutation.isPending && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Create account</Text>
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
  container:   { flex: 1, backgroundColor: '#0f172a' },
  inner:       { paddingHorizontal: 24, paddingVertical: 48, gap: 16 },
  title:       { fontSize: 22, fontWeight: '700', color: '#e2e8f0', textAlign: 'center' },
  subtitle:    { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 8 },
  field:       { gap: 4 },
  label:       { fontSize: 13, fontWeight: '600', color: '#cbd5e1' },
  input:       { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#e2e8f0', fontSize: 15 },
  inputError:  { borderColor: '#f87171' },
  errorText:   { fontSize: 12, color: '#f87171' },
  hint:        { fontSize: 11, color: '#475569' },
  btn:         { backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  googleBtn:    { backgroundColor: '#1e293b', borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  googleBtnText:{ color: '#e2e8f0', fontWeight: '600', fontSize: 14 },
  switchLink:   { alignItems: 'center', paddingTop: 8 },
  switchText:   { color: '#64748b', fontSize: 14 },
  switchAction: { color: '#818cf8', fontWeight: '600' },
});
