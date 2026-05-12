import { View, Text, StyleSheet } from 'react-native';
import type { Severity } from '@aankhanet/shared-types';

interface Props {
  value: Severity;
}

const COLORS: Record<Severity, { bg: string; text: string }> = {
  info:     { bg: '#1e293b', text: '#94a3b8' },
  low:      { bg: '#1e3a5f', text: '#60a5fa' },
  medium:   { bg: '#422006', text: '#fbbf24' },
  high:     { bg: '#431407', text: '#fb923c' },
  critical: { bg: '#450a0a', text: '#f87171' },
};

export default function SeverityBadge({ value }: Props) {
  const { bg, text } = COLORS[value];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{value.toUpperCase()}</Text>
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
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
