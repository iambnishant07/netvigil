import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/auth-context';
import { apiClient } from '../lib/api-client';
import type { AuthResponse } from '@netvigil/shared-types';
import type { AuthStackParamList } from '../navigation/AuthNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'MfaChallenge'>;

export default function MfaChallengeScreen({ route }: Props) {
  const { mfaToken } = route.params;
  const { login } = useAuth();
  const [code, setCode] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<AuthResponse>('/auth/mfa/challenge', { mfaToken, code }),
    onSuccess: async (data) => {
      await login(data);
    },
    onError: () => {
      Alert.alert('Invalid code', 'The code was incorrect or has expired. Try again.');
      setCode('');
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Two-factor authentication</Text>
        <Text style={styles.desc}>
          Enter the 6-digit code from your authenticator app.
        </Text>

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
          placeholderTextColor="#475569"
          autoFocus
        />

        <TouchableOpacity
          style={[styles.btn, (code.length < 6 || mutation.isPending) && styles.btnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={code.length < 6 || mutation.isPending}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Verify</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center' },
  inner:       { paddingHorizontal: 24, gap: 20, alignItems: 'center' },
  title:       { fontSize: 20, fontWeight: '700', color: '#e2e8f0' },
  desc:        { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  input:       { width: '100%', backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingVertical: 14, color: '#e2e8f0', fontSize: 32, letterSpacing: 12, textAlign: 'center' },
  btn:         { width: '100%', backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
