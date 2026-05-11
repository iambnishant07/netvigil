import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/auth-context';

export default function PendingScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Text style={styles.icon}>⏳</Text>
      </View>

      <Text style={styles.title}>Awaiting approval</Text>
      <Text style={styles.body}>
        Your access request for{'\n'}
        <Text style={styles.email}>{user?.email}</Text>
        {'\n'}is pending review by an organisation admin.
      </Text>
      <Text style={styles.hint}>
        You'll be notified once your request is approved. If you haven't heard back
        within 24 hours, contact your organisation administrator.
      </Text>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => void logout()}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconBox:   { width: 72, height: 72, borderRadius: 36, backgroundColor: '#451a0320', borderWidth: 1, borderColor: '#92400e', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  icon:      { fontSize: 32 },
  title:     { fontSize: 22, fontWeight: '700', color: '#e2e8f0', textAlign: 'center', marginBottom: 12 },
  body:      { fontSize: 15, color: '#94a3b8', textAlign: 'center', lineHeight: 24, marginBottom: 12 },
  email:     { color: '#e2e8f0', fontWeight: '600' },
  hint:      { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 40 },
  logoutBtn: { paddingHorizontal: 24, paddingVertical: 10 },
  logoutText:{ fontSize: 14, color: '#475569' },
});
