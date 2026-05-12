import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image, ScrollView,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/auth-context';
import { apiClient, TOKEN_KEY } from '../lib/api-client';
import type { AuthResponse } from '@aankhanet/shared-types';
import type { AuthStackParamList } from '../navigation/AuthNavigator';

WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const GOOGLE_CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] ?? '';
const API_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? '').replace(/\/api\/v1$/, '');

export default function LoginScreen({ navigation }: Props) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passErr,  setPassErr]  = useState('');

  const { login, biometricEnabled } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_URL}/api/v1/auth/google/mobile`,
        'aankhanet://',
      );
      if (result.type !== 'success') return;
      const pairs = result.url.replace(/^[^?]*\?/, '').split('&');
      const qp = (k: string) => { const e = pairs.find(s => s.startsWith(`${k}=`)); return e ? decodeURIComponent(e.slice(k.length + 1)) : ''; };
      const err = qp('error');
      if (err) { Alert.alert('Google sign-in failed', err); return; }

      // New user — backend returned a session token instead of full credentials
      if (qp('needs_org') === 'true') {
        navigation.navigate('GoogleOrgSelect', {
          googleSessionToken: qp('google_session_token'),
          email:              qp('email'),
        });
        return;
      }

      await login({
        accessToken:  qp('access_token'),
        refreshToken: qp('refresh_token'),
        expiresIn:    parseInt(qp('expires_in') || '900', 10),
        user: {
          id:             qp('user_id'),
          organizationId: qp('org_id'),
          email:          qp('email'),
          role:           (qp('role') || 'admin') as import('@aankhanet/shared-types').UserRole,
          status:         (qp('status') || 'active') as import('@aankhanet/shared-types').UserStatus,
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
    mutationFn: (data: { email: string; password: string }) =>
      apiClient.post<AuthResponse>('/auth/login', data),
    onSuccess: async (data) => {
      if (data.mfaRequired && data.mfaToken) {
        navigation.navigate('MfaChallenge', { mfaToken: data.mfaToken });
      } else {
        await login(data);
      }
    },
    onError: (err: Error) => {
      Alert.alert('Sign in failed', err.message);
    },
  });

  async function handleBiometric() {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) {
      Alert.alert('Not available', 'Please sign in with your email and password first.');
      return;
    }
    await LocalAuthentication.authenticateAsync({ promptMessage: 'Sign in to AankhaNet' });
  }

  function handleSubmit() {
    let valid = true;
    if (!email.includes('@')) {
      setEmailErr('Enter a valid email address');
      valid = false;
    } else {
      setEmailErr('');
    }
    if (password.length < 1) {
      setPassErr('Password is required');
      valid = false;
    } else {
      setPassErr('');
    }
    if (!valid) return;
    mutation.mutate({ email, password });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../assets/landing-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, emailErr ? styles.inputError : null]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor="#475569"
            testID="email-input"
          />
          {!!emailErr && <Text style={styles.errorText}>{emailErr}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, passErr ? styles.inputError : null]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
            placeholderTextColor="#475569"
            testID="password-input"
          />
          {!!passErr && <Text style={styles.errorText}>{passErr}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.btn, mutation.isPending && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={mutation.isPending}
          testID="login-btn"
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Sign in</Text>
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

        {biometricEnabled && (
          <TouchableOpacity style={styles.bioBtn} onPress={handleBiometric}>
            <Text style={styles.bioBtnText}>Use biometrics</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.switchLink} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.switchText}>No account? <Text style={styles.switchAction}>Create one</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0f172a' },
  inner:        { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40, gap: 16 },
  logo:         { width: '100%', height: 120, marginBottom: 8 },
  title:        { fontSize: 22, fontWeight: '700', color: '#e2e8f0', textAlign: 'center' },
  subtitle:     { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 8 },
  field:        { gap: 4 },
  label:        { fontSize: 13, fontWeight: '600', color: '#cbd5e1' },
  input:        { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#e2e8f0', fontSize: 15 },
  inputError:   { borderColor: '#f87171' },
  errorText:    { fontSize: 12, color: '#f87171' },
  btn:          { backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  btnDisabled:  { opacity: 0.6 },
  btnText:      { color: '#fff', fontWeight: '700', fontSize: 15 },
  googleBtn:    { backgroundColor: '#1e293b', borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  googleBtnText:{ color: '#e2e8f0', fontWeight: '600', fontSize: 14 },
  bioBtn:       { alignItems: 'center', paddingVertical: 10 },
  bioBtnText:   { color: '#818cf8', fontSize: 14 },
  switchLink:   { alignItems: 'center', paddingTop: 4 },
  switchText:   { color: '#64748b', fontSize: 14 },
  switchAction: { color: '#818cf8', fontWeight: '600' },
});
