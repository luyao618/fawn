import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, iconButtonRadius, layout, radii, shadows, spacing, typography } from '../../shared/theme';

/**
 * Mobile TopBar — aligns with `frontend/src/components/layout/TopBar.tsx`.
 *
 * - Sticky header look with a soft cream background and a frosted border.
 * - Optional back button on the left, optional right action slot.
 * - Title uses the brand `soft-charcoal` color and Nunito SemiBold.
 */

interface TopBarProps {
  title: string;
  /** Optional back press handler — renders the chevron when provided. */
  onBack?: () => void;
  /** Optional right-aligned slot for icons / actions. */
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

export function TopBar({ title, onBack, rightAction, style }: TopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrapper,
        // Honor the platform status bar so the rounded card sits below it.
        { paddingTop: insets.top + spacing['3'] },
        style,
      ]}
    >
      <View style={styles.bar}>
        <View style={styles.left}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="返回"
              style={styles.backButton}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colors['soft-charcoal']}
              />
            </Pressable>
          ) : null}
          <Text
            style={[typography.title, styles.title]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        <View style={styles.right}>{rightAction}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing['4'],
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing['3'],
    minHeight: layout.topbarBar,
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    backgroundColor: colors['topbar-surface'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['3'],
    ...shadows.topbar,
  },
  left: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    minWidth: 0,
  },
  right: {
    minHeight: layout.iconButton,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  title: {
    flexShrink: 1,
  },
  backButton: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: iconButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['back-button-surface'],
    ...shadows.card,
  },
});
