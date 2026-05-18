import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, spacing, typography } from '../../shared/theme';
import { MarkdownMessage } from './MarkdownMessage';

/**
 * Safety-alert bubble shown for `message_type === 'safety_alert'`.
 * Mirrors `frontend/src/components/chat/SafetyAlert.tsx`:
 *   - markdown body in soft-charcoal directly on the canvas (no surface fill,
 *     no border, no padding)
 *   - italic disclaimer footer in dark-gray
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
  },
  footer: {
    ...typography.bodySmall,
    fontFamily: fontFamily.sans,
    fontStyle: 'italic',
    color: colors['dark-gray'],
  },
});
