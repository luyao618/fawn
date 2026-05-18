/**
 * Button — RN-idiomatic port of frontend/src/components/ui/Button.tsx.
 *
 * Variants: primary | secondary | danger | text
 * 3D press affordance for primary/secondary: resting state has full card shadow;
 * pressed state snaps to translateY(+2) with reduced elevation.
 *
 * PORT NOTE: Android elevation cannot animate cleanly — pressed/resting is a
 * discrete swap per Pressable's pressed callback.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../../shared/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text';

export interface ButtonProps {
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  variant = 'primary',
  disabled = false,
  loading = false,
  onPress,
  children,
  style,
}: ButtonProps) {
  const isInteractive = !disabled && !loading;

  const labelColor = (variant === 'primary' || variant === 'danger')
    ? colors['on-brand']
    : variant === 'text'
      ? colors['fawn-amber']
      : colors['fawn-amber'];

  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      disabled={disabled || loading}
      hitSlop={8}
      android_ripple={null}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => {
        const base: ViewStyle[] = [styles.base, variantStyles[variant]];
        if (pressed && isInteractive) {
          base.push(pressedStyles[variant]);
          base.push(styles.pressedTransform);
        }
        if (disabled || loading) {
          base.push(styles.disabled);
        }
        if (style) base.push(style);
        return base;
      }}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} size="small" />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radii.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['5'],
    paddingVertical: spacing['3'],
    flexDirection: 'row',
    gap: spacing['2'],
    ...shadows.card,
  },
  pressedTransform: {
    transform: [{ translateY: 2 }],
    elevation: 1,
  },
  disabled: {
    opacity: 0.6,
    elevation: 0,
  },
  label: {
    ...typography.button,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors['fawn-amber'],
  },
  secondary: {
    backgroundColor: colors['card'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
  },
  danger: {
    backgroundColor: colors['safety-red'],
  },
  text: {
    backgroundColor: colors['transparent'],
    elevation: 0,
  },
});

const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors['brand-strong'],
  },
  secondary: {
    backgroundColor: colors['warm-gray'],
  },
  danger: {
    opacity: 0.85,
  },
  text: {
    opacity: 0.7,
  },
});
