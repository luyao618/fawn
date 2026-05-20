import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

/**
 * Drawer-level route names — these are the names registered on the top-level
 * `Drawer.Navigator` (one per tab stack), NOT the inner stack screen names
 * (which live in `routeNames.ts` as `ROUTES`).
 *
 * Keep these in sync with `RootNavigator.tsx` `<Drawer.Screen name=...>` calls
 * and with the active-route detection in `DrawerContent.tsx`.
 */
export const DRAWER_ROUTES = {
  CHAT: 'Chat',
  HISTORY: 'History',
  DASHBOARD: 'Dashboard',
  RECORD: 'Record',
  ALBUM: 'Album',
  PROFILE: 'Profile',
  SETTINGS: 'Settings',
} as const;

export type DrawerRoute = (typeof DRAWER_ROUTES)[keyof typeof DRAWER_ROUTES];

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface NavItem {
  /** Drawer-level route name (matches a `<Drawer.Screen>` registration). */
  route: DrawerRoute;
  /** Chinese label rendered next to the icon in the drawer body. */
  label: string;
  /** Ionicons name — picked to match the Web TabBar's Lucide icon visually. */
  icon: IoniconName;
}

/**
 * Main navigation items for the left drawer body. Order must mirror the
 * Web TabBar order (frontend/src/components/layout/TabBar.tsx):
 *   管家 / 成长 / 记录 / 相册 / 家庭.
 *
 * This list is the single source of truth for both:
 *   - the drawer body rendering (`DrawerContent.tsx`)
 *   - the legacy `TabBar.tsx` until that file is removed in Phase 6b
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { route: DRAWER_ROUTES.CHAT, label: '管家', icon: 'chatbubbles-outline' },
  { route: DRAWER_ROUTES.HISTORY, label: '历史', icon: 'time-outline' },
  { route: DRAWER_ROUTES.DASHBOARD, label: '成长', icon: 'stats-chart-outline' },
  { route: DRAWER_ROUTES.RECORD, label: '记录', icon: 'clipboard-outline' },
  { route: DRAWER_ROUTES.ALBUM, label: '相册', icon: 'image-outline' },
  { route: DRAWER_ROUTES.PROFILE, label: '家庭', icon: 'people-outline' },
] as const;

/**
 * Footer item — rendered below a divider at the bottom of the drawer body.
 * Visually and semantically separated from `NAV_ITEMS` so the layout matches
 * the Doubao reference (5 main entries + 1 settings entry below).
 */
export const SETTINGS_ITEM: NavItem = {
  route: DRAWER_ROUTES.SETTINGS,
  label: '设置',
  icon: 'settings-outline',
};
