import { View, Text, StyleSheet } from 'react-native';
import type { IncidentStatus } from '@aankhanet/shared-types';

interface Props {
  value: IncidentStatus;
}

const COLORS: Record<IncidentStatus, { bg: string; text: string }> = {
  open:           { bg: '#1e293b', text: '#94a3b8' },
  acknowledged:   { bg: '#1e3a5f', text: '#60a5fa' },
  confirmed:      { bg: '#14532d', text: '#4ade80' },
  false_positive: { bg: '#1a1a2e', text: '#6b7280' },
};

const LABELS: Record<IncidentStatus, string> = {
  open:           'Open',
  acknowledged:   'Acknowledged',
  confirmed:      'Confirmed',
  false_positive: 'False Positive',
};

export default function StatusBadge({ value }: Props) {
  const { bg, text } = COLORS[value];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{LABELS[value]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
  },
});
