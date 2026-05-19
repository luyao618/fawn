import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { NAV_ITEMS } from '../../navigation/navItems';
import { colors, layout, radii, shadows, spacing, typography } from '../../shared/theme';

/**
 * Mobile TabBar — DEPRECATED (kept temporarily during the drawer migration).
 *
 * The 5-tab bottom bar is being replaced by a left drawer
 * (`DrawerContent.tsx`). This file will be deleted in Phase 6b of the
 * drawer-nav refactor. Until then it re-exports the renamed `NAV_ITEMS`
 * (sourced from `navItems.ts`) as `TAB_ITEMS` so the rest of the codebase
 * keeps compiling.
 */

type TabIconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabDef {
  /** React Navigation route name. */
  route: string;
  /** Chinese label shown under the icon. Mirrors Web TabBar. */
  label: string;
  /** Ionicons name closest to the Lucide icon used on Web. */
  icon: TabIconName;
}

/**
 * Legacy export — alias of `NAV_ITEMS` for backward compatibility while the
 * drawer migration is in progress.
 */
export const TAB_ITEMS: TabDef[] = NAV_ITEMS.map((item) => ({
  route: item.route,
  label: item.label,
  icon: item.icon,
}));

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Hide the tab bar when the soft keyboard is up so chat / record forms get
  // the whole screen and the composer stays glued to the keyboard.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow';
    const hideEvt = Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboardVisible) return null;

  return (
    <View
      style={[
        styles.wrapper,
        // mirror Web `pb-[calc(10px+var(--safe-area-bottom))]`
        { paddingBottom: 10 + insets.bottom },
      ]}
    >
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const tab = TAB_ITEMS.find((t) => t.route === route.name);
          if (!tab) return null;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const { options } = descriptors[route.key];
          const accessibilityLabel =
            options.tabBarAccessibilityLabel ?? tab.label;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={accessibilityLabel}
              onPress={onPress}
              style={[styles.tab, isFocused && styles.tabActive]}
            >
              <Ionicons
                name={tab.icon}
                size={20}
                color={isFocused ? colors['brand-strong'] : colors['mid-gray']}
              />
              <Text
                style={[
                  typography.tabLabel,
                  {
                    color: isFocused
                      ? colors['brand-strong']
                      : colors['mid-gray'],
                  },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing['3'],
    paddingTop: spacing['5'],
    backgroundColor: colors.transparent,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.tabbarBar,
    borderTopLeftRadius: radii.tabbar,
    borderTopRightRadius: radii.tabbar,
    borderRadius: radii.tabbar,
    backgroundColor: colors['tabbar-surface'],
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    paddingHorizontal: spacing['2'],
    paddingTop: spacing['2'],
    ...shadows.tabbar,
  },
  tab: {
    flex: 1,
    minHeight: layout.tabItemMinHeight,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['1'],
    borderRadius: radii.lg,
    paddingHorizontal: spacing['1'],
  },
  tabActive: {
    backgroundColor: colors['nursery-mint'],
    ...shadows.card,
  },
});
