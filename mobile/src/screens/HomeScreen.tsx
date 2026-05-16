import Constants from 'expo-constants';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { BabyScreen } from './BabyScreen';
import { ConversationListScreen } from './ConversationListScreen';
import { ConversationScreen } from './ConversationScreen';

type Tab = 'home' | 'chat' | 'baby';

interface HomeScreenProps {
  onOpenSettings: () => void;
}

export function HomeScreen({ onOpenSettings }: HomeScreenProps) {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [openConversationId, setOpenConversationId] = useState<string | null>(null);

  const version =
    (Constants.expoConfig?.version ?? '0.0.0') +
    ` (build ${Constants.expoConfig?.android?.versionCode ?? '?'})`;

  const onSignOut = () => {
    Alert.alert('登出', '确定要退出当前账号吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '登出',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {tab === 'home' && (
          <View style={styles.container}>
            <Text style={styles.title}>Fawn</Text>
            <Text style={styles.subtitle}>家庭育儿 Agent · Android v1</Text>

            {user && (
              <View style={styles.userCard}>
                <Text style={styles.userName}>{user.display_name}</Text>
                <Text style={styles.userMeta}>
                  @{user.username} · {user.access_type}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onOpenSettings}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, styles.buttonSecondaryText]}>设置 / 切换账号</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, signingOut && styles.buttonDisabled]}
              onPress={onSignOut}
              disabled={signingOut}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{signingOut ? '登出中…' : '登出'}</Text>
            </TouchableOpacity>

            <Text style={styles.version}>v{version}</Text>
          </View>
        )}
        {tab === 'chat' && (
          openConversationId ? (
            <ConversationScreen
              conversationId={openConversationId}
              onBack={() => setOpenConversationId(null)}
            />
          ) : (
            <ConversationListScreen onOpenConversation={(id) => setOpenConversationId(id)} />
          )
        )}
        {tab === 'baby' && <BabyScreen />}
      </View>

      <View style={styles.tabBar}>
        <TabButton
          label="首页"
          active={tab === 'home'}
          onPress={() => {
            setTab('home');
          }}
        />
        <TabButton
          label="聊天"
          active={tab === 'chat'}
          onPress={() => {
            setTab('chat');
          }}
        />
        <TabButton
          label="宝宝"
          active={tab === 'baby'}
          onPress={() => {
            setTab('baby');
          }}
        />
      </View>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
      accessibilityRole="button"
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  body: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 24,
  },
  userCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 32,
    minWidth: 240,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#222',
  },
  userMeta: {
    fontSize: 13,
    color: '#777',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#b03030',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginBottom: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#2c7a4b',
  },
  buttonSecondaryText: { color: '#2c7a4b' },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  version: {
    fontSize: 13,
    color: '#888',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#fff',
  },
  tabLabel: {
    fontSize: 14,
    color: '#888',
  },
  tabLabelActive: {
    color: '#2c7a4b',
    fontWeight: '600',
  },
});
