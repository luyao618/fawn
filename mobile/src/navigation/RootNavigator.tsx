import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabBar } from '../components/layout/TabBar';
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
import { colors } from '../shared/theme';
import { ROUTES } from './routeNames';

/**
 * Root navigation skeleton: Bottom Tabs hosting 5 tabs (管家 / 成长 / 记录 /
 * 相册 / 家庭). Each tab is wrapped in its own native stack so subsequent
 * issues can push child screens (e.g. chat → history conversation, profile →
 * agent tasks) without disturbing the global tab bar.
 *
 * Today each tab renders a PlaceholderScreen. Replace these in the matching
 * sub-issues (#2..#6).
 */

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator;

// ----- Per-tab stacks -------------------------------------------------------

function ChatStack() {
  const ChatNav = Stack();
  return (
    <ChatNav.Navigator screenOptions={{ headerShown: false }}>
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
          const { id } = route.params as { id: string };
          return (
            <ConversationScreen
              conversationId={id}
              onBack={() => navigation.goBack()}
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
        {({ navigation }) => (
          <ProfileScreen
            onOpenAgentTasks={() => navigation.navigate(ROUTES.AGENT_TASKS)}
            onOpenMemory={() => navigation.navigate(ROUTES.MEMORY_FILE_LIST)}
          />
        )}
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

// ----- Root tab navigator ---------------------------------------------------

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
      <Tab.Navigator
        // Hide the default header — every screen renders its own TopBar.
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <TabBar {...props} />}
      >
        <Tab.Screen name="Chat" component={ChatStack} />
        <Tab.Screen name="Dashboard" component={DashboardStack} />
        <Tab.Screen name="Record" component={RecordStack} />
        <Tab.Screen name="Album" component={AlbumStack} />
        <Tab.Screen name="Profile" component={ProfileStack} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
