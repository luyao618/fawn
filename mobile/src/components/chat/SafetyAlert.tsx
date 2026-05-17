import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radii, spacing, typography } from '../../shared/theme';
import { MarkdownMessage } from './MarkdownMessage';

/**
 * Safety-alert bubble shown for `message_type === 'safety_alert'`.
 * Mirrors `frontend/src/components/chat/SafetyAlert.tsx`:
 *   - markdown body in soft-charcoal
 *   - italic disclaimer footer in dark-gray
 *
 * The outer surface (background, padding, shadow) is owned by
 * MessageBubble so this is a pure content shape.
 */

interface Props {
  content: string;
}

export function SafetyAlert({ content }: Props) {
  return (
    <View style={styles.root}>
      <MarkdownMessage content={content} textColor={colors['soft-charcoal']} />
      <Text style={styles.footer}>如症状持续或加重，请及时咨询医生或就医。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing['2'],
    borderRadius: radii.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors['safety-red'],
    backgroundColor: colors['safety-red-light'],
    paddingVertical: spacing['3'],
    paddingHorizontal: spacing['3'],
  },
  footer: {
    ...typography.bodySmall,
    fontFamily: fontFamily.sans,
    fontStyle: 'italic',
    color: colors['dark-gray'],
  },
});
