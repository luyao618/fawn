import { AxiosError } from 'axios';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { fetchFamilyMembers } from '../lib/auth';
import { StoredUser } from '../lib/tokenStorage';

interface SettingsScreenProps {
  onClose: () => void;
}

export function SettingsScreen({ onClose }: SettingsScreenProps) {
  const { user, accounts, scopeVersion, switchAccount, addAccount, forgetAccount, signOut } =
    useAuth();

  const [members, setMembers] = useState<StoredUser[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);

  /**
   * Re-fetch family members whenever the active scope changes. This is the
   * "all affected queries invalidate and refetch" hook required by the issue
   * — listing scopeVersion in the dependency array.
   */
  useEffect(() => {
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(null);
    (async () => {
      try {
        const list = await fetchFamilyMembers();
        if (cancelled) return;
        setMembers(list);
      } catch (err) {
        if (cancelled) return;
        const detail =
          (err as AxiosError<{ detail?: string }>).response?.data?.detail ?? '加载家庭成员失败';
        setMembersError(String(detail));
        setMembers(null);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeVersion]);

  const onSwitch = useCallback(
    async (userId: string) => {
      if (userId === user?.id) return;
      setSwitchingId(userId);
      try {
        await switchAccount(userId);
      } catch (err) {
        Alert.alert('切换失败', String((err as Error).message ?? err));
      } finally {
        setSwitchingId(null);
      }
    },
    [switchAccount, user?.id],
  );

  const onForget = useCallback(
    (userId: string, displayName: string) => {
      Alert.alert('移除账号', `确定要从本机移除 “${displayName}” 吗？此操作不会删除服务器上的账号。`, [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          style: 'destructive',
          onPress: async () => {
            setForgettingId(userId);
            try {
              await forgetAccount(userId);
            } finally {
              setForgettingId(null);
            }
          },
        },
      ]);
    },
    [forgetAccount],
  );

  const onAdd = useCallback(async () => {
    if (!addUsername.trim() || !addPassword) {
      Alert.alert('请填写完整', '用户名和密码不能为空');
      return;
    }
    setAddSubmitting(true);
    try {
      await addAccount(addUsername.trim(), addPassword);
      setAddOpen(false);
      setAddUsername('');
      setAddPassword('');
    } catch (err) {
      const detail =
        (err as AxiosError<{ detail?: string }>).response?.data?.detail ?? '登录失败，请稍后再试';
      Alert.alert('添加账号失败', String(detail));
    } finally {
      setAddSubmitting(false);
    }
  }, [addAccount, addPassword, addUsername]);

  const onSignOut = useCallback(() => {
    Alert.alert('全部登出', '将清除本机所有已登录账号，确定吗？', [
      { text: '取消', style: 'cancel' },
      { text: '全部登出', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.headerBack}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>设置</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Current account */}
        <Text style={styles.section}>当前账号</Text>
        {user ? (
          <View style={styles.card}>
            <Text style={styles.userName}>{user.display_name}</Text>
            <Text style={styles.userMeta}>
              @{user.username} · {user.access_type}
            </Text>
            <Text style={styles.userMeta}>family · {user.family_id.slice(0, 8)}…</Text>
          </View>
        ) : (
          <Text style={styles.muted}>未登录</Text>
        )}

        {/* Family members of current account */}
        <Text style={styles.section}>当前家庭成员</Text>
        {membersLoading && (
          <View style={styles.inlineRow}>
            <ActivityIndicator size="small" color="#2c7a4b" />
            <Text style={[styles.muted, { marginLeft: 8 }]}>加载中…</Text>
          </View>
        )}
        {!membersLoading && membersError && (
          <Text style={[styles.muted, styles.error]}>{membersError}</Text>
        )}
        {!membersLoading && !membersError && members && members.length === 0 && (
          <Text style={styles.muted}>暂无其他家庭成员</Text>
        )}
        {!membersLoading &&
          !membersError &&
          members?.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.display_name}</Text>
                <Text style={styles.memberMeta}>
                  @{m.username} · {m.access_type}
                </Text>
              </View>
              {m.id === user?.id && <Text style={styles.badge}>本机</Text>}
            </View>
          ))}

        {/* Switch between stored accounts */}
        <Text style={styles.section}>已登录账号</Text>
        {accounts.length === 0 && <Text style={styles.muted}>本机没有已登录账号</Text>}
        {accounts.map((acc) => {
          const isActive = acc.user.id === user?.id;
          const isSwitching = switchingId === acc.user.id;
          const isForgetting = forgettingId === acc.user.id;
          return (
            <View key={acc.user.id} style={styles.accountRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{acc.user.display_name}</Text>
                <Text style={styles.memberMeta}>
                  @{acc.user.username} · family {acc.user.family_id.slice(0, 8)}…
                </Text>
              </View>
              {isActive ? (
                <Text style={styles.activeBadge}>使用中</Text>
              ) : (
                <TouchableOpacity
                  style={[styles.smallButton, isSwitching && styles.buttonDisabled]}
                  onPress={() => onSwitch(acc.user.id)}
                  disabled={isSwitching || isForgetting}
                  accessibilityRole="button"
                >
                  <Text style={styles.smallButtonText}>
                    {isSwitching ? '切换中…' : '切换'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.smallButton, styles.smallButtonGhost]}
                onPress={() => onForget(acc.user.id, acc.user.display_name)}
                disabled={isSwitching || isForgetting}
                accessibilityRole="button"
              >
                <Text style={[styles.smallButtonText, styles.smallButtonGhostText]}>
                  {isForgetting ? '…' : '移除'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Add another account */}
        {!addOpen ? (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setAddOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.addButtonText}>+ 添加另一个账号</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.addCard}>
            <Text style={styles.label}>用户名</Text>
            <TextInput
              value={addUsername}
              onChangeText={setAddUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username"
              style={styles.input}
              editable={!addSubmitting}
            />
            <Text style={styles.label}>密码</Text>
            <TextInput
              value={addPassword}
              onChangeText={setAddPassword}
              secureTextEntry
              placeholder="••••••"
              style={styles.input}
              editable={!addSubmitting}
            />
            <View style={styles.addActions}>
              <TouchableOpacity
                style={[styles.smallButton, styles.smallButtonGhost]}
                onPress={() => {
                  setAddOpen(false);
                  setAddUsername('');
                  setAddPassword('');
                }}
                disabled={addSubmitting}
              >
                <Text style={[styles.smallButtonText, styles.smallButtonGhostText]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallButton, addSubmitting && styles.buttonDisabled]}
                onPress={onAdd}
                disabled={addSubmitting}
              >
                {addSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.smallButtonText}>登录并添加</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.signOutButton]}
          onPress={onSignOut}
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>全部登出</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  headerBack: { fontSize: 16, color: '#2c7a4b', width: 48 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 48 },
  section: {
    fontSize: 13,
    color: '#888',
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 16,
  },
  userName: { fontSize: 18, fontWeight: '600', color: '#222' },
  userMeta: { fontSize: 13, color: '#777', marginTop: 2 },
  muted: { color: '#888', fontSize: 14 },
  error: { color: '#b03030' },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  memberName: { fontSize: 15, color: '#222', fontWeight: '500' },
  memberMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  badge: {
    backgroundColor: '#eef6f0',
    color: '#2c7a4b',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 8,
  },
  activeBadge: {
    color: '#2c7a4b',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  smallButton: {
    backgroundColor: '#2c7a4b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  smallButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  smallButtonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#bbb',
  },
  smallButtonGhostText: { color: '#555' },
  buttonDisabled: { opacity: 0.6 },
  addButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2c7a4b',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addButtonText: { color: '#2c7a4b', fontWeight: '600' },
  addCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 4,
  },
  label: { fontSize: 13, color: '#444', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  addActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  signOutButton: {
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#b03030',
    alignItems: 'center',
  },
  signOutText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
