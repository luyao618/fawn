import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, iconButtonRadius, layout, radii, shadows, spacing, typography } from '../../shared/theme';

/**
 * Mobile TopBar — aligns with `frontend/src/components/layout/TopBar.tsx`.
 *
 * - Sticky header look with a soft cream background and a frosted border.
 * - Optional leading button: either a back chevron (`onBack`) OR a hamburger
 *   menu (`onMenu`) — mutually exclusive at the TypeScript level via a
 *   discriminated union, so a caller cannot accidentally pass both.
 * - Optional right action slot.
 * - Title uses the brand `soft-charcoal` color and Nunito SemiBold.
 */

interface BaseTopBarProps {
  title: string;
  /** Optional right-aligned slot for icons / actions. */
  rightAction?: React.ReactNode;
  style?: ViewStyle;
}

type LeadingMenu = { onMenu: (() => void) | undefined; onBack?: never };
type LeadingBack = { onBack: (() => void) | undefined; onMenu?: never };
type LeadingNone = { onBack?: never; onMenu?: never };

export type TopBarProps = BaseTopBarProps & (LeadingMenu | LeadingBack | LeadingNone);

export function TopBar(props: TopBarProps) {
  const { title, rightAction, style } = props;
  // Narrow without referencing the union members directly; runtime branches
  // are mutually exclusive by construction (see discriminated union above).
  const onBack = 'onBack' in props ? props.onBack : undefined;
  const onMenu = 'onMenu' in props ? props.onMenu : undefined;
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
          {onMenu ? (
            <Pressable
              onPress={onMenu}
              accessibilityRole="button"
              accessibilityLabel="菜单"
              style={styles.backButton}
            >
              <Ionicons
                name="menu-outline"
                size={24}
                color={colors['soft-charcoal']}
              />
            </Pressable>
          ) : onBack ? (
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
