import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, iconButtonRadius, layout, spacing, typography } from '../../shared/theme';

/**
 * Mobile TopBar — minimal, 豆包-style.
 *
 * - Flush with the page canvas: no card surface, no border, no shadow, no
 *   rounded corners. The bar simply sits below the system status bar and
 *   inherits the screen background so the header reads as part of the page
 *   rather than a floating chip.
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
        // Sit directly under the system status bar, no card padding above.
        { paddingTop: insets.top },
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
              style={styles.iconButton}
              hitSlop={8}
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
              style={styles.iconButton}
              hitSlop={8}
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
    // Transparent so the screen's canvas color shows through — this is what
    // makes the header read as "part of the system status bar" rather than a
    // floating chip.
    backgroundColor: colors.transparent,
    paddingHorizontal: spacing['4'],
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing['3'],
    minHeight: layout.topbarBar,
    paddingVertical: spacing['2'],
    // No background, no border, no shadow, no rounded corners — flush with
    // the page so it blends into the system status bar.
    backgroundColor: colors.transparent,
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
  iconButton: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: iconButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    // Naked tap target — no surface tint or shadow so the icon reads as a
    // simple system glyph against the page background.
    backgroundColor: colors.transparent,
  },
});
