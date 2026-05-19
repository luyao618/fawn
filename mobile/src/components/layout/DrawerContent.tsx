import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerContentScrollView, type DrawerContentComponentProps } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';

import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from '../../navigation/navItems';
import { colors, radii, spacing, typography } from '../../shared/theme';

/**
 * Custom drawer body for the Fawn mobile app.
 *
 * Layout: 5 primary nav items (管家 / 成长 / 记录 / 相册 / 家庭) at the top,
 * a thin divider, then a single "设置" entry at the bottom. Matches the
 * Doubao reference layout (per `.omc/specs/deep-interview-mobile-drawer-nav.md`).
 *
 * Visual tokens come from `mobile/src/shared/theme`. The active item uses
 * `nursery-mint` background + `brand-strong` text/icon — same active treatment
 * the old bottom `TabBar` used so the visual identity carries over.
 */
export function DrawerContent(props: DrawerContentComponentProps) {
  const { state, navigation } = props;
  const activeRoute = state.routes[state.index]?.name;

  const onPress = (item: NavItem) => {
    // `navigate` on a Drawer.Navigator auto-closes the drawer on selection
    // (React Navigation 7 default), so no explicit closeDrawer() needed.
    navigation.navigate(item.route);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'bottom']}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.mainSection}>
          {NAV_ITEMS.map((item) => (
            <DrawerRow
              key={item.route}
              item={item}
              active={activeRoute === item.route}
              onPress={() => onPress(item)}
            />
          ))}
        </View>
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <View style={styles.divider} />
        <DrawerRow
          item={SETTINGS_ITEM}
          active={activeRoute === SETTINGS_ITEM.route}
          onPress={() => onPress(SETTINGS_ITEM)}
        />
      </View>
    </SafeAreaView>
  );
}

interface DrawerRowProps {
  item: NavItem;
  active: boolean;
  onPress: () => void;
}

function DrawerRow({ item, active, onPress }: DrawerRowProps) {
  const tint = active ? colors['brand-strong'] : colors['soft-charcoal'];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && !active && styles.rowPressed,
      ]}
    >
      <Ionicons name={item.icon} size={22} color={tint} />
      <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  scrollContent: {
    paddingTop: spacing['2'],
    paddingHorizontal: spacing['3'],
  },
  mainSection: {
    gap: spacing['1'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['3'],
    borderRadius: radii.lg,
  },
  rowActive: {
    backgroundColor: colors['fawn-amber-light'],
  },
  rowPressed: {
    backgroundColor: colors['warm-gray'],
  },
  label: {
    ...typography.body,
    fontFamily: typography.heading.fontFamily,
  },
  footer: {
    paddingHorizontal: spacing['3'],
    paddingBottom: spacing['2'],
  },
  divider: {
    height: 1,
    backgroundColor: colors['oat-border'],
    marginVertical: spacing['2'],
    marginHorizontal: spacing['2'],
  },
});
