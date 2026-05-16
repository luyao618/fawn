import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { colors, radii, shadows, spacing, typography } from '../../shared/theme';

/**
 * Mobile TabBar — aligns with `frontend/src/components/layout/TabBar.tsx`.
 *
 * Tab order, labels, and icons must mirror the Web TabBar so navigation
 * feels identical on both platforms: 管家 / 成长 / 记录 / 相册 / 家庭.
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

export const TAB_ITEMS: TabDef[] = [
  { route: 'Chat', label: '管家', icon: 'chatbubbles-outline' },
  { route: 'Dashboard', label: '成长', icon: 'stats-chart-outline' },
  { route: 'Record', label: '记录', icon: 'clipboard-outline' },
  { route: 'Album', label: '相册', icon: 'image-outline' },
  { route: 'Profile', label: '家庭', icon: 'people-outline' },
];

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

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
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 78,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    paddingHorizontal: spacing['2'],
    paddingTop: spacing['2'],
    ...shadows.tabbar,
  },
  tab: {
    flex: 1,
    minHeight: 58,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radii.lg,
    paddingHorizontal: spacing['1'],
  },
  tabActive: {
    backgroundColor: colors['nursery-mint'],
    ...shadows.card,
  },
});
