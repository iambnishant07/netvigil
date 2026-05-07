import { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/auth-context';
import { apiClient } from '../lib/api-client';
import type { User } from '@netvigil/shared-types';
import type { SettingsStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<SettingsStackParamList, 'SettingsHome'>;

export default function SettingsScreen({ navigation }: Props) {
  const { user: storedUser, biometricEnabled, setBiometric, logout } = useAuth();
  const [pushToken,   setPushToken]   = useState<string | null>(null);
  const [hasHardware, setHasHardware] = useState(false);
  const [loggingOut,  setLoggingOut]  = useState(false);

  // Always fetch fresh user data so mfaEnrolled reflects the real DB state
  const { data: freshUser } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<User>('/auth/me'),
    staleTime: 0,
  });

  const user = freshUser ?? storedUser;

  useEffect(() => {
    void LocalAuthentication.hasHardwareAsync().then(setHasHardware);
  }, []);

  async function handleBiometricToggle(enabled: boolean) {
    if (enabled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your identity to enable biometric lock',
      });
      if (!result.success) return;
    }
    await setBiometric(enabled);
  }

  async function handlePushPermission() {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Enable notifications in your device settings.');
      return;
    }
    try {
      const projectId: string =
        (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
        (Constants.easConfig?.projectId as string | undefined) ??
        'a81c625a-08ba-4f88-8b49-7d1630c242e9';
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      setPushToken(tokenData.data);
      await apiClient.put<void>('/auth/me/push-token', { pushToken: tokenData.data });
      Alert.alert('Success', 'Push notifications enabled.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Push token error', msg);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.emailLabel}>Signed in as</Text>
          <Text style={styles.email}>{user?.email ?? '—'}</Text>
        </View>
      </View>

      {/* Security */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Biometric lock</Text>
              <Text style={styles.settingDesc}>
                {hasHardware
                  ? 'Require biometric when opening the app'
                  : 'Not available on this device'}
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              disabled={!hasHardware}
              trackColor={{ false: '#334155', true: '#4f46e5' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </View>

      {/* MFA */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security — Two-factor auth</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              if (user?.mfaEnrolled) {
                Alert.alert(
                  'Disable MFA',
                  'This will remove two-factor authentication from your account. Are you sure?',
                  [{ text: 'Cancel', style: 'cancel' }, { text: 'Disable', style: 'destructive', onPress: () => navigation.navigate('MfaSetup') }],
                );
              } else {
                navigation.navigate('MfaSetup');
              }
            }}
          >
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>
                {user?.mfaEnrolled ? '✅ MFA enabled' : 'Enable MFA'}
              </Text>
              <Text style={styles.settingDesc}>
                {user?.mfaEnrolled
                  ? 'Tap to manage or disable'
                  : 'Add a second factor via authenticator app'}
              </Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={handlePushPermission}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable push notifications</Text>
              <Text style={styles.settingDesc}>Required for real-time incident alerts</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>
          {pushToken && (
            <View style={styles.tokenContainer}>
              <Text style={styles.tokenLabel}>Expo push token</Text>
              <Text style={styles.tokenText} selectable>{pushToken}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity
        style={[styles.logoutBtn, loggingOut && styles.logoutBtnDisabled]}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        {loggingOut
          ? <ActivityIndicator color="#f87171" />
          : <Text style={styles.logoutText}>Sign out</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0f172a' },
  content:            { padding: 16, gap: 20 },
  section:            { gap: 8 },
  sectionTitle:       { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 4 },
  card:               { backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden' },
  emailLabel:         { fontSize: 12, color: '#64748b', padding: 16, paddingBottom: 4 },
  email:              { fontSize: 15, color: '#e2e8f0', paddingHorizontal: 16, paddingBottom: 16 },
  settingRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, gap: 12 },
  actionRow:          { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  settingInfo:        { flex: 1 },
  settingLabel:       { fontSize: 15, color: '#e2e8f0', fontWeight: '500' },
  settingDesc:        { fontSize: 12, color: '#64748b', marginTop: 2 },
  actionArrow:        { fontSize: 18, color: '#64748b' },
  tokenContainer:     { paddingHorizontal: 16, paddingBottom: 16 },
  tokenLabel:         { fontSize: 11, color: '#64748b', marginBottom: 4 },
  tokenText:          { fontSize: 11, fontFamily: 'monospace', color: '#818cf8', backgroundColor: '#0f172a', padding: 10, borderRadius: 6 },
  logoutBtn:          { backgroundColor: '#1e293b', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#7f1d1d' },
  logoutBtnDisabled:  { opacity: 0.6 },
  logoutText:         { color: '#f87171', fontWeight: '600', fontSize: 16 },
});
