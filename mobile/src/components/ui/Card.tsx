/**
 * Card — RN-idiomatic port of frontend/src/components/ui/Card.tsx.
 *
 * A simple surface wrapper with brand radii, card shadow, and default padding.
 * Use as a layout container for any card-shaped content block.
 */

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radii, shadows, spacing } from '../../shared/theme';

export interface CardProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export function Card({ children, style, padding }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        padding !== undefined && { padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors['card'],
    borderRadius: radii.card,
    padding: spacing['4'],
    ...shadows.card,
  },
});
