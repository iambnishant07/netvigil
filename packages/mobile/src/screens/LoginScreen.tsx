import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/auth-context';
import { apiClient, TOKEN_KEY } from '../lib/api-client';
import type { AuthResponse } from '@netvigil/shared-types';
import type { AuthStackParamList } from '../navigation/AuthNavigator';

WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const GOOGLE_CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] ?? '';

export default function LoginScreen({ navigation }: Props) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passErr,  setPassErr]  = useState('');

  const { login, biometricEnabled } = useAuth();

  const [_request, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
  });

  const googleMutation = useMutation({
    mutationFn: (idToken: string) =>
      apiClient.post<AuthResponse>('/auth/google', { idToken }),
    onSuccess: async (data) => { await login(data); },
    onError:   (err: Error) => Alert.alert('Google sign-in failed', err.message),
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const token = googleResponse.params['id_token'];
      if (token) googleMutation.mutate(token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

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
    await LocalAuthentication.authenticateAsync({ promptMessage: 'Sign in to NetVigil' });
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
      <View style={styles.inner}>
        <Text style={styles.title}>Sign in to NetVigil</Text>
        <Text style={styles.subtitle}>AI-driven network threat detection</Text>

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
            style={[styles.googleBtn, googleMutation.isPending && styles.btnDisabled]}
            onPress={() => void promptGoogleAsync()}
            disabled={googleMutation.isPending}
          >
            <Text style={styles.googleBtnText}>🔵  Continue with Google</Text>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center' },
  inner:        { paddingHorizontal: 24, gap: 16 },
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
