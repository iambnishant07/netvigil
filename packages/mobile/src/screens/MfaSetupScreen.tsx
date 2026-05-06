import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { apiClient } from '../lib/api-client';
import type { SettingsStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<SettingsStackParamList, 'MfaSetup'>;

export default function MfaSetupScreen({ navigation }: Props) {
  const [uri,  setUri]  = useState('');
  const [code, setCode] = useState('');

  const setupMutation = useMutation({
    mutationFn: () => apiClient.post<{ provisioningUri: string }>('/auth/mfa/setup', {}),
    onSuccess: (data) => setUri(data.provisioningUri),
    onError:   (err: Error) => Alert.alert('Setup failed', err.message),
  });

  const verifyMutation = useMutation({
    mutationFn: () => apiClient.post<void>('/auth/mfa/verify', { code }),
    onSuccess: () => {
      Alert.alert('MFA enabled', 'Your account is now protected by two-factor authentication.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err: Error) => Alert.alert('Invalid code', err.message),
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Set up two-factor authentication</Text>
      <Text style={styles.desc}>
        Scan the QR code below with an authenticator app (Google Authenticator,
        Authy, 1Password) then enter the 6-digit code to confirm.
      </Text>

      {!uri && (
        <TouchableOpacity
          style={[styles.btn, setupMutation.isPending && styles.btnDisabled]}
          onPress={() => setupMutation.mutate()}
          disabled={setupMutation.isPending}
        >
          {setupMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Generate QR code</Text>
          }
        </TouchableOpacity>
      )}

      {!!uri && (
        <>
          <View style={styles.qrContainer}>
            <QRCode value={uri} size={200} backgroundColor="#ffffff" />
          </View>

          <Text style={styles.fieldLabel}>Enter 6-digit code from your app</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            placeholderTextColor="#475569"
          />

          <TouchableOpacity
            style={[styles.btn, (code.length < 6 || verifyMutation.isPending) && styles.btnDisabled]}
            onPress={() => verifyMutation.mutate()}
            disabled={code.length < 6 || verifyMutation.isPending}
          >
            {verifyMutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Verify and enable</Text>
            }
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0f172a' },
  content:     { padding: 24, gap: 20, alignItems: 'center' },
  title:       { fontSize: 18, fontWeight: '700', color: '#e2e8f0', textAlign: 'center' },
  desc:        { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  qrContainer: { backgroundColor: '#fff', padding: 12, borderRadius: 12 },
  fieldLabel:  { fontSize: 13, fontWeight: '600', color: '#cbd5e1', alignSelf: 'flex-start' },
  input:       { width: '100%', backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, color: '#e2e8f0', fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  btn:         { width: '100%', backgroundColor: '#6366f1', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
