// 家庭 / Profile screen — mobile counterpart of
// `frontend/src/app/(main)/profile/page.tsx`.
//
// Visual language strictly comes from `mobile/src/shared/theme.ts` (YAO-31).
// No hard-coded colors / radii / shadows / type sizes are allowed here.
//
// In scope (YAO-36):
//   - Show current account + family identity card (matches Web hero card).
//   - List family members with role label and access-type chip; role badge
//     uses `colors[role-mom/dad/grandma/grandpa]` to mirror Web hex exactly.
//   - Account switching / forget / add (functional parity with the old
//     SettingsScreen, re-skinned).
//   - Secondary-entry row to `AgentTasks`. Navigation is forwarded to the
//     enclosing stack via the `onOpenAgentTasks` prop so this component
//     stays framework-agnostic.
//
// Out of scope: editing baby profile / memory files / permissions
// (separate Web-only flows that need new mobile endpoints).

import { AxiosError } from 'axios';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { TopBar } from '../components/layout/TopBar';
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';

interface ProfileScreenProps {
  /**
   * Navigate to the AgentTasks secondary entry. Wired by the
   * ProfileStack in RootNavigator.
   */
  onOpenAgentTasks: () => void;
  /**
   * Navigate to the History list secondary entry. Wired by the
   * ProfileStack in RootNavigator. Mirrors the Web `app/(main)/history`
   * surface so the two-screen history flow is reachable from 家庭 tab.
   */
  onOpenHistory: () => void;
}

const ACCESS_TYPE_LABEL: Record<string, string> = {
  parent: '父母',
  family: '家人',
  friend: '朋友',
};

const ROLE_COLOR_TOKEN = {
  mom: 'role-mom',
  dad: 'role-dad',
  grandma: 'role-grandma',
  grandpa: 'role-grandpa',
} as const;

type RoleKey = keyof typeof ROLE_COLOR_TOKEN;

/**
 * Resolve a free-form role string to the brand role-color token. Anything
 * outside the four canonical roles falls back to the neutral `dark-gray`
 * so we never invent a hex outside the design system.
 */
function roleAccentColor(role: string | undefined | null): string {
  if (!role) return colors['dark-gray'];
  const normalized = role.trim().toLowerCase();
  for (const key of Object.keys(ROLE_COLOR_TOKEN) as RoleKey[]) {
    if (normalized === key) return colors[ROLE_COLOR_TOKEN[key]];
  }
  // Heuristic for the Chinese role labels the backend may persist.
  if (normalized.includes('mom') || normalized.includes('妈')) return colors['role-mom'];
  if (normalized.includes('dad') || normalized.includes('爸')) return colors['role-dad'];
  if (normalized.includes('grandma') || normalized.includes('奶') || normalized.includes('姥'))
    return colors['role-grandma'];
  if (normalized.includes('grandpa') || normalized.includes('爷') || normalized.includes('外公'))
    return colors['role-grandpa'];
  return colors['dark-gray'];
}

function accessTypeLabel(t: string | undefined | null): string {
  if (!t) return '';
  return ACCESS_TYPE_LABEL[t] ?? t;
}

export function ProfileScreen({ onOpenAgentTasks, onOpenHistory }: ProfileScreenProps) {
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

  // Re-fetch family members whenever the active scope changes (account switch).
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
      Alert.alert(
        '移除账号',
        `确定要从本机移除 “${displayName}” 吗？此操作不会删除服务器上的账号。`,
        [
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
        ],
      );
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
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar title="家庭" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero card — mirrors Web `bg-gradient-to-br from-white to-fawn-amber-light`. */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {user?.display_name ?? '家庭设置'}
          </Text>
          <View style={styles.heroMetaRow}>
            <RoleDot color={roleAccentColor(user?.role)} />
            <Text style={styles.heroMeta} numberOfLines={1}>
              {user?.role ? user.role + ' · ' : ''}
              {accessTypeLabel(user?.access_type)}
            </Text>
          </View>
          {user ? (
            <Text style={styles.heroFootnote} numberOfLines={1}>
              @{user.username} · family {user.family_id.slice(0, 8)}…
            </Text>
          ) : (
            <Text style={styles.heroFootnote}>未登录</Text>
          )}
        </View>

        {/* AgentTasks secondary entry — visually a tappable card. */}
        <SectionCard
          icon="sparkles-outline"
          eyebrow="自动化"
          title="Agent 任务"
          onPress={onOpenAgentTasks}
          accessibilityLabel="打开 Agent 任务"
          rightAdornment={
            <Ionicons name="chevron-forward" size={20} color={colors['mid-gray']} />
          }
        />

        {/* History secondary entry — opens the two-screen history flow. */}
        <SectionCard
          icon="time-outline"
          eyebrow="历史会话"
          title="对话记录"
          onPress={onOpenHistory}
          accessibilityLabel="打开历史会话"
          rightAdornment={
            <Ionicons name="chevron-forward" size={20} color={colors['mid-gray']} />
          }
        />

        {/* Family members */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderIcon}>
              <Ionicons name="people-outline" size={20} color={colors['brand-strong']} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionEyebrow}>家庭成员</Text>
              <Text style={styles.sectionTitle}>账号与权限</Text>
            </View>
          </View>

          {membersLoading && (
            <View style={styles.inlineRow}>
              <ActivityIndicator size="small" color={colors['fawn-amber']} />
              <Text style={[styles.muted, { marginLeft: spacing['2'] }]}>加载中…</Text>
            </View>
          )}
          {!membersLoading && membersError && (
            <Text style={[styles.muted, styles.errorText]}>{membersError}</Text>
          )}
          {!membersLoading && !membersError && members && members.length === 0 && (
            <Text style={styles.muted}>暂无其他家庭成员</Text>
          )}
          {!membersLoading &&
            !membersError &&
            members?.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <RoleDot color={roleAccentColor(m.role)} />
                <View style={styles.memberRowMain}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.display_name}
                  </Text>
                  <Text style={styles.memberMeta} numberOfLines={1}>
                    @{m.username}
                    {m.role ? ' · ' + m.role : ''}
                  </Text>
                </View>
                <Text style={styles.accessChip}>{accessTypeLabel(m.access_type)}</Text>
                {m.id === user?.id ? <Text style={styles.selfBadge}>本机</Text> : null}
              </View>
            ))}
        </View>

        {/* Account switching */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionHeaderIcon, styles.sectionHeaderIconAlt]}>
              <Ionicons name="swap-horizontal" size={20} color={colors['info-blue']} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionEyebrow}>本机账号</Text>
              <Text style={styles.sectionTitle}>切换 / 添加</Text>
            </View>
          </View>

          {accounts.length === 0 && <Text style={styles.muted}>本机没有已登录账号</Text>}
          {accounts.map((acc) => {
            const isActive = acc.user.id === user?.id;
            const isSwitching = switchingId === acc.user.id;
            const isForgetting = forgettingId === acc.user.id;
            return (
              <View key={acc.user.id} style={styles.accountRow}>
                <View style={styles.memberRowMain}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {acc.user.display_name}
                  </Text>
                  <Text style={styles.memberMeta} numberOfLines={1}>
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

          {!addOpen ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setAddOpen(true)}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color={colors['brand-strong']} />
              <Text style={styles.addButtonText}>添加另一个账号</Text>
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
                placeholderTextColor={colors['mid-gray']}
                style={styles.input}
                editable={!addSubmitting}
              />
              <Text style={styles.label}>密码</Text>
              <TextInput
                value={addPassword}
                onChangeText={setAddPassword}
                secureTextEntry
                placeholder="••••••"
                placeholderTextColor={colors['mid-gray']}
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
                  <Text style={[styles.smallButtonText, styles.smallButtonGhostText]}>
                    取消
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, addSubmitting && styles.buttonDisabled]}
                  onPress={onAdd}
                  disabled={addSubmitting}
                >
                  {addSubmitting ? (
                    <ActivityIndicator color={colors['card']} />
                  ) : (
                    <Text style={styles.smallButtonText}>登录并添加</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={onSignOut}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={18} color={colors['card']} />
          <Text style={styles.signOutText}>全部登出</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Brand-colored dot used as a role accent. Always 8x8 / fully rounded. */
function RoleDot({ color }: { color: string }) {
  return <View style={[styles.roleDot, { backgroundColor: color }]} />;
}

/**
 * Reusable tappable section card — used here for the AgentTasks entry. It
 * matches the visual rhythm of the static sections below it so the entry
 * doesn't read as a stray button.
 */
function SectionCard({
  icon,
  eyebrow,
  title,
  onPress,
  rightAdornment,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  eyebrow: string;
  title: string;
  onPress: () => void;
  rightAdornment?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.sectionCard, pressed && styles.sectionCardPressed]}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderIcon}>
          <Ionicons name={icon} size={20} color={colors['brand-strong']} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {rightAdornment}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors['warm-cream'] },
  scroll: {
    padding: spacing['4'],
    paddingBottom: spacing['12'],
    gap: spacing['4'],
  },

  // Hero
  heroCard: {
    backgroundColor: colors['card'],
    borderRadius: radii.card,
    padding: spacing['5'],
    borderWidth: 1,
    borderColor: colors['fawn-amber-light'],
    gap: spacing['2'],
    ...shadows.card,
  },
  heroTitle: {
    ...typography.title,
    color: colors['soft-charcoal'],
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
  },
  heroMeta: {
    ...typography.body,
    color: colors['dark-gray'],
    flexShrink: 1,
  },
  heroFootnote: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
  },

  // Section card (used by AgentTasks entry + member list etc.)
  sectionCard: {
    backgroundColor: colors['card'],
    borderRadius: radii.card,
    padding: spacing['4'],
    gap: spacing['3'],
    ...shadows.card,
  },
  sectionCardPressed: {
    opacity: 0.85,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
  },
  sectionHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors['nursery-mint'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderIconAlt: {
    backgroundColor: colors['nursery-powder'],
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionEyebrow: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  sectionTitle: {
    ...typography.heading,
    color: colors['soft-charcoal'],
  },

  // Member row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    paddingVertical: spacing['2'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors['oat-border'],
  },
  memberRowMain: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    ...typography.body,
    color: colors['soft-charcoal'],
    fontFamily: typography.heading.fontFamily,
  },
  memberMeta: {
    ...typography.caption,
    color: colors['mid-gray'],
    marginTop: spacing['1'],
  },
  accessChip: {
    ...typography.caption,
    color: colors['soft-charcoal'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.chip,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    overflow: 'hidden',
  },
  selfBadge: {
    ...typography.caption,
    color: colors['brand-strong'],
    backgroundColor: colors['nursery-mint'],
    borderRadius: radii.chip,
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['1'],
    overflow: 'hidden',
  },
  roleDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
  },

  // Account switching
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    paddingVertical: spacing['2'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors['oat-border'],
  },
  activeBadge: {
    ...typography.caption,
    color: colors['brand-strong'],
    fontFamily: typography.heading.fontFamily,
    marginRight: spacing['2'],
  },
  smallButton: {
    backgroundColor: colors['fawn-amber'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    borderRadius: radii.chip,
  },
  smallButtonText: {
    ...typography.caption,
    color: colors['card'],
    fontFamily: typography.heading.fontFamily,
  },
  smallButtonGhost: {
    backgroundColor: colors['transparent'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
  },
  smallButtonGhostText: {
    color: colors['dark-gray'],
  },
  buttonDisabled: { opacity: 0.6 },

  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['1'],
    marginTop: spacing['2'],
    paddingVertical: spacing['3'],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors['fawn-amber'],
    borderStyle: 'dashed',
  },
  addButtonText: {
    ...typography.button,
    color: colors['brand-strong'],
  },
  addCard: {
    marginTop: spacing['2'],
    padding: spacing['3'],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    backgroundColor: colors['warm-gray'],
    gap: spacing['1'],
  },
  label: {
    ...typography.caption,
    color: colors['dark-gray'],
    marginTop: spacing['1'],
  },
  input: {
    ...typography.body,
    color: colors['soft-charcoal'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.md,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    backgroundColor: colors['card'],
  },
  addActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing['2'],
    marginTop: spacing['3'],
  },

  // Sign out
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['2'],
    marginTop: spacing['4'],
    paddingVertical: spacing['4'],
    borderRadius: radii.md,
    backgroundColor: colors['safety-red'],
  },
  signOutText: {
    ...typography.button,
    color: colors['card'],
  },

  // Helpers
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  muted: {
    ...typography.body,
    color: colors['mid-gray'],
  },
  errorText: {
    color: colors['safety-red'],
  },
});
