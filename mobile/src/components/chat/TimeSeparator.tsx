/**
 * TimeSeparator — RN-idiomatic port of frontend/src/components/chat/TimeSeparator.tsx.
 *
 * Renders a centered date/time pill between message clusters in the chat list.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../shared/theme';

export interface TimeSeparatorProps {
  timestamp: string;
}

function formatDateTime(ts: string): string {
  try {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return ts;
  }
}

// Consumed by ConversationScreen (Phase 4 IA migration).
export function TimeSeparator({ timestamp }: TimeSeparatorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{formatDateTime(timestamp)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3'],
  },
  label: {
    ...typography.caption,
    color: colors['mid-gray'],
    backgroundColor: colors['mid-gray'] + '1A', // ~10% opacity
    borderRadius: radii.md,
    paddingHorizontal: spacing['2'],
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
