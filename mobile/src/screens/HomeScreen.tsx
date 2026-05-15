import Constants from 'expo-constants';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';

export function HomeScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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
        style={[styles.button, signingOut && styles.buttonDisabled]}
        onPress={onSignOut}
        disabled={signingOut}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{signingOut ? '登出中…' : '登出'}</Text>
      </TouchableOpacity>

      <Text style={styles.version}>v{version}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: 24,
  },
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
});
