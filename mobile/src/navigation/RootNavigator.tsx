import React from 'react';
import { DrawerActions, NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DrawerContent } from '../components/layout/DrawerContent';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ConversationListScreen } from '../screens/ConversationListScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AgentTasksScreen } from '../screens/AgentTasksScreen';
import { HistoryListScreen } from '../screens/HistoryListScreen';
import { HistoryConversationScreen } from '../screens/HistoryConversationScreen';
import { RecordsScreen } from '../screens/RecordsScreen';
import { AlbumScreen } from '../screens/AlbumScreen';
import { MemoryFileListScreen } from '../screens/MemoryFileListScreen';
import { MemoryFileEditorScreen } from '../screens/MemoryFileEditorScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../shared/theme';
import { DRAWER_ROUTES } from './navItems';
import { ROUTES } from './routeNames';

/**
 * Root navigation skeleton: left Drawer hosting 6 entries (5 main +
 * Settings). Each entry is wrapped in its own native stack so child screens
 * (e.g. chat → history conversation, profile → agent tasks) can be pushed
 * without disturbing the drawer.
 *
 * Drawer replaces the previous bottom-tabs layout — see
 * `.omc/plans/mobile-drawer-nav.md` ADR for rationale.
 */

const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator;

// ----- Per-tab stacks -------------------------------------------------------

function ChatStack() {
  const ChatNav = Stack();
  return (
    <ChatNav.Navigator
      // Chat tab now lands directly on the conversation surface — the list
      // screen stays registered for future deep-links but is no longer the
      // tab root (mirrors Web /chat → ChatClient with no intermediate page).
      initialRouteName={ROUTES.CHAT_CONVERSATION}
      screenOptions={{ headerShown: false }}
    >
      <ChatNav.Screen name={ROUTES.CHAT_LIST}>
        {({ navigation }) => (
          <ConversationListScreen
            onOpenConversation={(id) =>
              navigation.navigate(ROUTES.CHAT_CONVERSATION, { id })
            }
          />
        )}
      </ChatNav.Screen>
      <ChatNav.Screen name={ROUTES.CHAT_CONVERSATION}>
        {({ navigation, route }) => {
          const params = (route.params ?? {}) as { id?: string };
          // No id == tab root entry: ConversationScreen resolves the active
          // conversation internally and renders a minimal TopBar with the
          // hamburger button so the user can open the drawer from chat.
          const isTabRoot = !params.id;
          return (
            <ConversationScreen
              conversationId={params.id}
              onBack={isTabRoot ? undefined : () => navigation.goBack()}
              tabRoot={isTabRoot}
            />
          );
        }}
      </ChatNav.Screen>
      {/*
        History screens live in ChatStack so the two-screen history surface
        shares the 管家 tab's back stack and does not inflate the bottom bar
        with a dedicated tab (per YAO-36 IA alignment decision).
      */}
      <ChatNav.Screen name={ROUTES.HISTORY_LIST}>
        {({ navigation }) => (
          <HistoryListScreen
            onOpenConversation={(id) =>
              navigation.navigate(ROUTES.HISTORY_CONVERSATION, { id })
            }
          />
        )}
      </ChatNav.Screen>
      <ChatNav.Screen name={ROUTES.HISTORY_CONVERSATION}>
        {({ route, navigation }) => {
          const params = (route.params ?? {}) as { id?: string };
          return (
            <HistoryConversationScreen
              conversationId={params.id ?? ''}
              onBack={() => navigation.goBack()}
            />
          );
        }}
      </ChatNav.Screen>
    </ChatNav.Navigator>
  );
}

function DashboardStack() {
  const DashboardNav = Stack();
  return (
    <DashboardNav.Navigator screenOptions={{ headerShown: false }}>
      <DashboardNav.Screen name={ROUTES.DASHBOARD_HOME} component={DashboardScreen} />
    </DashboardNav.Navigator>
  );
}

function RecordStack() {
  const RecordNav = Stack();
  return (
    <RecordNav.Navigator screenOptions={{ headerShown: false }}>
      <RecordNav.Screen name={ROUTES.RECORD_HOME} component={RecordsScreen} />
    </RecordNav.Navigator>
  );
}

function AlbumStack() {
  const AlbumNav = Stack();
  return (
    <AlbumNav.Navigator screenOptions={{ headerShown: false }}>
      <AlbumNav.Screen name={ROUTES.ALBUM_HOME} component={AlbumScreen} />
    </AlbumNav.Navigator>
  );
}

function ProfileStack() {
  const ProfileNav = Stack();
  return (
    <ProfileNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileNav.Screen name={ROUTES.PROFILE_HOME}>
        {({ navigation }) => <ProfileScreen navigation={navigation} />}
      </ProfileNav.Screen>
      <ProfileNav.Screen name={ROUTES.AGENT_TASKS}>
        {({ navigation }) => (
          <AgentTasksScreen onClose={() => navigation.goBack()} />
        )}
      </ProfileNav.Screen>
      <ProfileNav.Screen name={ROUTES.MEMORY_FILE_LIST}>
        {({ navigation }) => <MemoryFileListScreen navigation={navigation} />}
      </ProfileNav.Screen>
      <ProfileNav.Screen name={ROUTES.MEMORY_FILE_EDITOR}>
        {({ route, navigation }) => (
          <MemoryFileEditorScreen
            route={route as { params: { id: string } }}
            navigation={navigation}
          />
        )}
      </ProfileNav.Screen>
    </ProfileNav.Navigator>
  );
}

function SettingsStack() {
  const SettingsNav = Stack();
  return (
    <SettingsNav.Navigator screenOptions={{ headerShown: false }}>
      <SettingsNav.Screen name="SettingsHome">
        {({ navigation }) => (
          <SettingsScreen
            // Re-open the drawer when the user taps the in-page "‹ 返回"
            // button — the most intuitive contract since the user arrived
            // here from the drawer.
            onClose={() => navigation.dispatch(DrawerActions.openDrawer())}
          />
        )}
      </SettingsNav.Screen>
    </SettingsNav.Navigator>
  );
}

// ----- Root drawer navigator -----------------------------------------------

export function RootNavigator() {
  return (
    <NavigationContainer
      // Keep the bar color consistent with the warm-cream canvas so the
      // status / system area doesn't flash white during screen transitions.
      theme={{
        dark: false,
        colors: {
          primary: colors['fawn-amber'],
          background: colors['warm-cream'],
          card: colors['card'],
          text: colors['soft-charcoal'],
          border: colors['oat-border'],
          notification: colors['safety-red'],
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <Drawer.Navigator
        id={'DrawerNav' as never}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          drawerStyle: { width: '78%', backgroundColor: colors['warm-cream'] },
          swipeEdgeWidth: 32,
          overlayColor: colors['modal-backdrop'],
        }}
        drawerContent={(props) => <DrawerContent {...props} />}
      >
        <Drawer.Screen name={DRAWER_ROUTES.CHAT} component={ChatStack} />
        <Drawer.Screen name={DRAWER_ROUTES.DASHBOARD} component={DashboardStack} />
        <Drawer.Screen name={DRAWER_ROUTES.RECORD} component={RecordStack} />
        <Drawer.Screen name={DRAWER_ROUTES.ALBUM} component={AlbumStack} />
        <Drawer.Screen name={DRAWER_ROUTES.PROFILE} component={ProfileStack} />
        <Drawer.Screen name={DRAWER_ROUTES.SETTINGS} component={SettingsStack} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}
