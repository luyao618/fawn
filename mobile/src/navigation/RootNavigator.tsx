import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabBar } from '../components/layout/TabBar';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { colors } from '../shared/theme';

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
      <ChatNav.Screen
        name="ChatHome"
        children={() => (
          <PlaceholderScreen
            title="管家"
            description="聊天页将由后续子 issue（YAO-32）实现。"
          />
        )}
      />
    </ChatNav.Navigator>
  );
}

function DashboardStack() {
  const DashboardNav = Stack();
  return (
    <DashboardNav.Navigator screenOptions={{ headerShown: false }}>
      <DashboardNav.Screen
        name="DashboardHome"
        children={() => (
          <PlaceholderScreen
            title="成长"
            description="Dashboard 将由后续子 issue（YAO-33）合并三屏实现。"
          />
        )}
      />
    </DashboardNav.Navigator>
  );
}

function RecordStack() {
  const RecordNav = Stack();
  return (
    <RecordNav.Navigator screenOptions={{ headerShown: false }}>
      <RecordNav.Screen
        name="RecordHome"
        children={() => (
          <PlaceholderScreen
            title="记录"
            description="记录页将由后续子 issue（YAO-34）实现。"
          />
        )}
      />
    </RecordNav.Navigator>
  );
}

function AlbumStack() {
  const AlbumNav = Stack();
  return (
    <AlbumNav.Navigator screenOptions={{ headerShown: false }}>
      <AlbumNav.Screen
        name="AlbumHome"
        children={() => (
          <PlaceholderScreen
            title="相册"
            description="相册（网格 + 大图 + 上传）将由后续子 issue（YAO-35）实现。"
          />
        )}
      />
    </AlbumNav.Navigator>
  );
}

function ProfileStack() {
  const ProfileNav = Stack();
  return (
    <ProfileNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileNav.Screen
        name="ProfileHome"
        children={() => (
          <PlaceholderScreen
            title="家庭"
            description="家庭 / Profile 与 AgentTasks 二级入口将由后续子 issue（YAO-36）实现。"
          />
        )}
      />
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
