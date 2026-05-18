// 家庭 / Profile screen — mobile counterpart of
// `frontend/src/app/(main)/profile/page.tsx` (frozen at 0396b121).
//
// Visual language strictly comes from `mobile/src/shared/theme.ts`.
// All five sections from the web reference are mirrored here:
//   1. Hero card (family name + current-user subtitle + password/logout)
//   2. Family members inline list (role + permission chip + edit modal)
//   3. Baby profile inline card (weight/height/head + editor modal)
//   4. Long-term memory inline list (navigate to MemoryFileEditor)
//   5. Agent tasks entry (mobile-only secondary)
//
// Edit flows are implemented with native <Modal>s for simplicity.

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { TopBar } from '../components/layout/TopBar';
import { Button } from '../components/ui/Button';
import {
  createUser,
  deleteUser,
  getBaby,
  getFamily,
  getMemoryFiles,
  getUsers,
  updateBaby,
  updateFamily,
  updateUser,
  updateUserPassword,
  type MemoryFileSummary,
} from '../lib/api';
import type {
  Baby,
  Family,
  User,
  UserAccessType,
  UserCreate,
} from '../lib/types';
import {
  accessTypeLabel,
  canManageFamily,
  getAgeDisplay,
  roleLabel,
} from '../lib/utils';
import { ROUTES } from '../navigation/routeNames';
import {
  borderWidth,
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';

interface ProfileScreenProps {
  navigation: {
    navigate: (route: string, params?: Record<string, unknown>) => void;
  };
}

const ACCESS_TYPES: Array<{ value: UserAccessType; label: string; caption: string }> = [
  { value: 'parent', label: '父母', caption: '管理账号' },
  { value: 'family', label: '家人', caption: '记录数据' },
  { value: 'friend', label: '朋友', caption: '只读查看' },
];

const EMPTY_MEMBER_DRAFT: UserCreate = {
  username: '',
  display_name: '',
  password: '',
  access_type: 'family',
  role: '',
};

function textOrNull(value: string | null | undefined): string | null {
  const t = String(value ?? '').trim();
  return t ? t : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function memoryIconName(kind: MemoryFileSummary['kind']): React.ComponentProps<typeof Ionicons>['name'] {
  if (kind === 'soul') return 'bulb-outline';
  if (kind === 'baby') return 'happy-outline';
  if (kind === 'user') return 'person-circle-outline';
  return 'book-outline';
}

function babyDisplayName(baby: Baby | null): string {
  return baby?.name?.trim() || '宝宝档案';
}

function babySubtitle(baby: Baby | null): string {
  if (!baby) return '尚未创建';
  const age = baby.birth_date ? getAgeDisplay(baby.birth_date) : '出生日期待填';
  const gender =
    baby.gender === 'male' ? '男孩' : baby.gender === 'female' ? '女孩' : '性别待填';
  return `${gender} · ${age}`;
}

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { user: currentUser, signOut } = useAuth();
  const canManage = canManageFamily(currentUser?.access_type);

  // Data state
  const [family, setFamily] = useState<Family | null>(null);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editor state
  const [familyEditorOpen, setFamilyEditorOpen] = useState(false);
  const [familyName, setFamilyName] = useState('');

  const [babyEditorOpen, setBabyEditorOpen] = useState(false);
  const [babyDraft, setBabyDraft] = useState<Partial<Baby>>({});

  const [createMemberOpen, setCreateMemberOpen] = useState(false);
  const [memberDraft, setMemberDraft] = useState<UserCreate>(EMPTY_MEMBER_DRAFT);

  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [memberEditDraft, setMemberEditDraft] = useState({
    display_name: '',
    role: '',
    access_type: 'family' as UserAccessType,
    password: '',
  });

  const [permissionHelpOpen, setPermissionHelpOpen] = useState(false);

  const [passwordTarget, setPasswordTarget] = useState<{ id: string; display_name: string } | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [familyData, babyData, usersData, memoryData] = await Promise.all([
        getFamily(),
        getBaby(),
        getUsers(),
        getMemoryFiles(),
      ]);
      setFamily(familyData);
      setFamilyName(familyData.name);
      setBaby(babyData);
      setBabyDraft(babyData ?? {});
      setUsers(usersData);
      setMemoryFiles(memoryData);
    } catch (err) {
      setLoadError(String((err as Error).message ?? err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openFamilyEditor() {
    setFamilyName(family?.name ?? '');
    setFamilyEditorOpen(true);
  }

  function openBabyEditor() {
    setBabyDraft(baby ?? { name: null, gender: null, birth_date: null, is_premature: false });
    setBabyEditorOpen(true);
  }

  function openCreateMember() {
    setMemberDraft(EMPTY_MEMBER_DRAFT);
    setCreateMemberOpen(true);
  }

  function openMemberEditor(member: User) {
    setEditingMember(member);
    setMemberEditDraft({
      display_name: member.display_name,
      role: member.role,
      access_type: member.access_type,
      password: '',
    });
  }

  function openPasswordEditor(target: { id: string; display_name: string }) {
    setPasswordTarget(target);
    setPasswordDraft('');
  }

  function handleLogout() {
    Alert.alert('登出账户', '确定要登出当前账号吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '登出',
        style: 'destructive',
        onPress: () => void signOut(),
      },
    ]);
  }

  async function submitFamily() {
    try {
      const updated = await updateFamily({ name: familyName });
      setFamily(updated);
      setFamilyEditorOpen(false);
    } catch (err) {
      Alert.alert('修改失败', String((err as Error).message ?? err));
    }
  }

  async function submitBaby() {
    try {
      const updated = await updateBaby({
        ...babyDraft,
        name: textOrNull(babyDraft.name),
        gender: babyDraft.gender ?? null,
        birth_date: textOrNull(babyDraft.birth_date),
        birth_weight_g: numberOrNull(babyDraft.birth_weight_g),
        birth_height_cm: numberOrNull(babyDraft.birth_height_cm),
        birth_head_cm: numberOrNull(babyDraft.birth_head_cm),
        gestational_weeks: numberOrNull(babyDraft.gestational_weeks),
        is_premature: babyDraft.is_premature ?? false,
      });
      setBaby(updated);
      setBabyDraft(updated);
      setBabyEditorOpen(false);
    } catch (err) {
      Alert.alert('保存失败', String((err as Error).message ?? err));
    }
  }

  async function submitPassword() {
    if (!passwordTarget || !passwordDraft.trim()) return;
    try {
      await updateUserPassword(passwordTarget.id, passwordDraft.trim());
      setPasswordTarget(null);
      setPasswordDraft('');
      Alert.alert('密码已更新');
    } catch (err) {
      Alert.alert('修改失败', String((err as Error).message ?? err));
    }
  }

  async function submitCreateMember() {
    try {
      await createUser(memberDraft);
      setMemberDraft(EMPTY_MEMBER_DRAFT);
      setCreateMemberOpen(false);
      setUsers(await getUsers());
    } catch (err) {
      Alert.alert('创建失败', String((err as Error).message ?? err));
    }
  }

  async function submitUpdateMember() {
    if (!editingMember) return;
    try {
      await updateUser(editingMember.id, {
        display_name: memberEditDraft.display_name,
        role: memberEditDraft.role,
        access_type: memberEditDraft.access_type,
      });
      if (memberEditDraft.password.trim()) {
        await updateUserPassword(editingMember.id, memberEditDraft.password.trim());
      }
      setEditingMember(null);
      setUsers(await getUsers());
    } catch (err) {
      Alert.alert('保存失败', String((err as Error).message ?? err));
    }
  }

  function confirmDeleteMember(member: User) {
    Alert.alert(
      '删除账号',
      `确认删除 ${member.display_name} 的账号？历史记录会保留。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUser(member.id);
              setEditingMember(null);
              setUsers(await getUsers());
            } catch (err) {
              Alert.alert('删除失败', String((err as Error).message ?? err));
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <TopBar title="家庭" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={colors['fawn-amber']} />
          </View>
        ) : loadError ? (
          <View style={styles.centerBlock}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable onPress={() => void load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>重试</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 1. Hero card */}
            <View style={styles.heroCard}>
              <View style={styles.heroHeaderRow}>
                <View style={styles.heroHeaderMain}>
                  <Text style={styles.heroTitle} numberOfLines={1}>
                    {family?.name ?? '家庭设置'}
                  </Text>
                  <Text style={styles.heroSubtitle} numberOfLines={1}>
                    {currentUser?.display_name ?? '家庭成员'} · {roleLabel(currentUser?.role)} ·{' '}
                    {accessTypeLabel(currentUser?.access_type)}
                  </Text>
                </View>
                {canManage ? (
                  <Pressable
                    onPress={openFamilyEditor}
                    accessibilityLabel="修改家庭名称"
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors['dark-gray']} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.heroActions}>
                {canManage && currentUser ? (
                  <Pressable
                    onPress={() => openPasswordEditor({ id: currentUser.id, display_name: currentUser.display_name })}
                    style={({ pressed }) => [
                      styles.subtleButton,
                      pressed && styles.pressed,
                      styles.subtleButtonFlex,
                    ]}
                  >
                    <Ionicons name="key-outline" size={16} color={colors['dark-gray']} />
                    <Text style={styles.subtleButtonText}>修改密码</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleLogout}
                  style={({ pressed }) => [
                    styles.subtleButton,
                    pressed && styles.pressed,
                    styles.subtleButtonFlex,
                  ]}
                >
                  <Ionicons name="log-out-outline" size={16} color={colors['dark-gray']} />
                  <Text style={styles.subtleButtonText}>登出账户</Text>
                </Pressable>
              </View>
            </View>

            {/* 2. Family members */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.headerBadge, styles.headerBadgeMint]}>
                    <Ionicons name="people-outline" size={20} color={colors['brand-strong']} />
                  </View>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.cardEyebrow}>家庭成员</Text>
                    <Text style={styles.cardTitle}>账号与权限</Text>
                  </View>
                </View>
                <View style={styles.cardHeaderActions}>
                  <Pressable
                    onPress={() => setPermissionHelpOpen(true)}
                    accessibilityLabel="查看权限说明"
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="help-circle-outline" size={18} color={colors['dark-gray']} />
                  </Pressable>
                  {canManage ? (
                    <Pressable
                      onPress={openCreateMember}
                      style={({ pressed }) => [styles.quietAction, pressed && styles.pressed]}
                    >
                      <Ionicons name="add-outline" size={16} color={colors['dark-gray']} />
                      <Text style={styles.quietActionText}>新增</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View style={styles.listBlock}>
                {users.map((member, idx) => {
                  const last = idx === users.length - 1;
                  return (
                    <Pressable
                      key={member.id}
                      onPress={canManage ? () => openMemberEditor(member) : undefined}
                      disabled={!canManage}
                      style={({ pressed }) => [
                        styles.memberRow,
                        !last && styles.rowDivider,
                        pressed && canManage && styles.pressedRow,
                      ]}
                      accessibilityLabel={canManage ? `编辑${member.display_name}` : undefined}
                    >
                      <View style={styles.memberMain}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {member.display_name}
                        </Text>
                        <Text style={styles.memberHandle} numberOfLines={1}>
                          @{member.username}
                        </Text>
                      </View>
                      <Text style={styles.memberRole} numberOfLines={1}>
                        {roleLabel(member.role)}
                      </Text>
                      <View style={styles.memberRight}>
                        <Text style={styles.accessChip}>
                          {accessTypeLabel(member.access_type).replace('权限', '')}
                        </Text>
                        {canManage ? (
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors['mid-gray']}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
                {users.length === 0 ? (
                  <Text style={styles.emptyText}>暂无成员</Text>
                ) : null}
              </View>
            </View>

            {/* 3. Baby profile */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.headerBadge, styles.headerBadgePowder]}>
                    <Ionicons name="happy-outline" size={20} color={colors['info-blue']} />
                  </View>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.cardEyebrow}>宝宝档案</Text>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {babyDisplayName(baby)} · {babySubtitle(baby)}
                    </Text>
                  </View>
                </View>
                {canManage ? (
                  <Pressable
                    onPress={openBabyEditor}
                    accessibilityLabel={baby ? '修改宝宝档案' : '创建宝宝档案'}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                  >
                    <Ionicons
                      name={baby ? 'pencil-outline' : 'add-outline'}
                      size={18}
                      color={colors['dark-gray']}
                    />
                  </Pressable>
                ) : null}
              </View>
              {baby ? (
                <View style={styles.babyGrid}>
                  <BabyMetric label="出生体重" value={baby.birth_weight_g ? `${baby.birth_weight_g}g` : '暂无'} />
                  <BabyMetric label="身高" value={baby.birth_height_cm ? `${baby.birth_height_cm}cm` : '暂无'} />
                  <BabyMetric label="头围" value={baby.birth_head_cm ? `${baby.birth_head_cm}cm` : '暂无'} />
                </View>
              ) : (
                <View style={styles.babyEmpty}>
                  <Text style={styles.babyEmptyText}>还没有宝宝档案。</Text>
                  {canManage ? (
                    <Pressable
                      onPress={openBabyEditor}
                      style={({ pressed }) => [styles.babyCreateBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="add-outline" size={16} color={colors['fawn-amber']} />
                      <Text style={styles.babyCreateText}>创建档案</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>

            {/* 4. Memory files */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.headerBadge, styles.headerBadgeButter]}>
                    <Ionicons name="book-outline" size={20} color={colors['warning-amber']} />
                  </View>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.cardEyebrow}>长期记忆</Text>
                    <Text style={styles.cardTitle}>Markdown 文件</Text>
                  </View>
                </View>
              </View>
              <View style={styles.listBlock}>
                {memoryFiles.map((file, idx) => {
                  const last = idx === memoryFiles.length - 1;
                  return (
                    <Pressable
                      key={file.id}
                      onPress={() =>
                        navigation.navigate(ROUTES.MEMORY_FILE_EDITOR, { id: file.id })
                      }
                      style={({ pressed }) => [
                        styles.memoryRow,
                        !last && styles.rowDivider,
                        pressed && styles.pressedRow,
                      ]}
                    >
                      <View style={styles.memoryIconWrap}>
                        <Ionicons
                          name={memoryIconName(file.kind)}
                          size={20}
                          color={colors['fawn-amber']}
                        />
                      </View>
                      <View style={styles.memoryMain}>
                        <Text style={styles.memoryLabel} numberOfLines={1}>
                          {file.label}
                        </Text>
                        <Text style={styles.memoryMeta} numberOfLines={1}>
                          {file.can_edit ? '可编辑' : '只读'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors['mid-gray']} />
                    </Pressable>
                  );
                })}
                {memoryFiles.length === 0 ? (
                  <Text style={styles.emptyText}>暂无记忆文件</Text>
                ) : null}
              </View>
            </View>

            {/* 5. Agent tasks entry (mobile-only) */}
            <Pressable
              onPress={() => navigation.navigate(ROUTES.AGENT_TASKS)}
              accessibilityLabel="打开 Agent 任务"
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.headerBadge, styles.headerBadgeMint]}>
                    <Ionicons name="sparkles-outline" size={20} color={colors['brand-strong']} />
                  </View>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.cardEyebrow}>自动化</Text>
                    <Text style={styles.cardTitle}>Agent 任务</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors['mid-gray']} />
              </View>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Modals */}
      <EditorModal
        visible={familyEditorOpen}
        title="修改家庭名称"
        onClose={() => setFamilyEditorOpen(false)}
      >
        <Text style={styles.label}>家庭名称</Text>
        <TextInput
          value={familyName}
          onChangeText={setFamilyName}
          placeholder="家庭名称"
          placeholderTextColor={colors['mid-gray']}
          style={styles.input}
        />
        <ModalActions onCancel={() => setFamilyEditorOpen(false)} onSubmit={submitFamily} submitText="保存" />
      </EditorModal>

      <EditorModal
        visible={!!passwordTarget}
        title="修改密码"
        eyebrow={passwordTarget?.display_name}
        onClose={() => setPasswordTarget(null)}
      >
        <Text style={styles.label}>新密码</Text>
        <TextInput
          value={passwordDraft}
          onChangeText={setPasswordDraft}
          placeholder="至少 6 位"
          placeholderTextColor={colors['mid-gray']}
          secureTextEntry
          style={styles.input}
        />
        <ModalActions onCancel={() => setPasswordTarget(null)} onSubmit={submitPassword} submitText="保存" />
      </EditorModal>

      <EditorModal
        visible={babyEditorOpen}
        title={baby ? '修改宝宝档案' : '创建宝宝档案'}
        eyebrow={baby?.name ?? undefined}
        onClose={() => setBabyEditorOpen(false)}
      >
        <View style={styles.row2}>
          <View style={styles.col}>
            <Text style={styles.label}>姓名</Text>
            <TextInput
              value={babyDraft.name ?? ''}
              onChangeText={(v) => setBabyDraft((s) => ({ ...s, name: v }))}
              placeholder="宝宝姓名"
              placeholderTextColor={colors['mid-gray']}
              style={styles.input}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>出生日期</Text>
            <TextInput
              value={babyDraft.birth_date ?? ''}
              onChangeText={(v) => setBabyDraft((s) => ({ ...s, birth_date: v }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors['mid-gray']}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
        </View>
        <Text style={styles.label}>性别</Text>
        <View style={styles.segmented}>
          {([
            { value: null, label: '暂不填' },
            { value: 'male', label: '男孩' },
            { value: 'female', label: '女孩' },
          ] as const).map((item) => {
            const selected = (babyDraft.gender ?? null) === item.value;
            return (
              <Pressable
                key={item.label}
                onPress={() => setBabyDraft((s) => ({ ...s, gender: item.value }))}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.row3}>
          <View style={styles.col}>
            <Text style={styles.label}>体重(g)</Text>
            <TextInput
              value={babyDraft.birth_weight_g != null ? String(babyDraft.birth_weight_g) : ''}
              onChangeText={(v) =>
                setBabyDraft((s) => ({ ...s, birth_weight_g: v ? Number(v) : null }))
              }
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>身高(cm)</Text>
            <TextInput
              value={babyDraft.birth_height_cm != null ? String(babyDraft.birth_height_cm) : ''}
              onChangeText={(v) =>
                setBabyDraft((s) => ({ ...s, birth_height_cm: v ? Number(v) : null }))
              }
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>头围(cm)</Text>
            <TextInput
              value={babyDraft.birth_head_cm != null ? String(babyDraft.birth_head_cm) : ''}
              onChangeText={(v) =>
                setBabyDraft((s) => ({ ...s, birth_head_cm: v ? Number(v) : null }))
              }
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
        </View>
        <ModalActions onCancel={() => setBabyEditorOpen(false)} onSubmit={submitBaby} submitText="保存" />
      </EditorModal>

      <EditorModal
        visible={permissionHelpOpen}
        title="权限说明"
        eyebrow="父母、家人、朋友"
        onClose={() => setPermissionHelpOpen(false)}
      >
        <View style={styles.permGroup}>
          <Text style={styles.permLine}>
            父母：管理账号、修改密码、宝宝档案和长期记忆，并拥有所有日常权限。
          </Text>
          <Text style={styles.permLine}>
            家人：记录数据、上传/下载照片、软删除普通数据，并和管家聊天。
          </Text>
          <Text style={styles.permLine}>
            朋友：查看所有内容、下载照片、参与聊天，但不能写入或删除数据。
          </Text>
        </View>
        <View style={{ height: spacing['2'] }} />
        <Button onPress={() => setPermissionHelpOpen(false)} variant="secondary">
          关闭
        </Button>
      </EditorModal>

      <EditorModal
        visible={createMemberOpen}
        title="新增账号"
        eyebrow="家庭成员"
        onClose={() => setCreateMemberOpen(false)}
      >
        <Text style={styles.label}>用户名</Text>
        <TextInput
          value={memberDraft.username}
          onChangeText={(v) => setMemberDraft((s) => ({ ...s, username: v }))}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.label}>初始密码</Text>
        <TextInput
          value={memberDraft.password}
          onChangeText={(v) => setMemberDraft((s) => ({ ...s, password: v }))}
          secureTextEntry
          style={styles.input}
        />
        <View style={styles.row2}>
          <View style={styles.col}>
            <Text style={styles.label}>昵称</Text>
            <TextInput
              value={memberDraft.display_name}
              onChangeText={(v) => setMemberDraft((s) => ({ ...s, display_name: v }))}
              style={styles.input}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>角色</Text>
            <TextInput
              value={memberDraft.role}
              onChangeText={(v) => setMemberDraft((s) => ({ ...s, role: v }))}
              placeholder="奶奶/医生"
              placeholderTextColor={colors['mid-gray']}
              style={styles.input}
            />
          </View>
        </View>
        <Text style={styles.label}>权限类型</Text>
        <AccessTypePicker
          value={memberDraft.access_type}
          onChange={(access_type) => setMemberDraft((s) => ({ ...s, access_type }))}
        />
        <ModalActions
          onCancel={() => setCreateMemberOpen(false)}
          onSubmit={submitCreateMember}
          submitText="创建"
        />
      </EditorModal>

      <EditorModal
        visible={!!editingMember}
        title="编辑账号"
        eyebrow={editingMember ? `@${editingMember.username}` : undefined}
        onClose={() => setEditingMember(null)}
      >
        <View style={styles.row2}>
          <View style={styles.col}>
            <Text style={styles.label}>昵称</Text>
            <TextInput
              value={memberEditDraft.display_name}
              onChangeText={(v) => setMemberEditDraft((s) => ({ ...s, display_name: v }))}
              style={styles.input}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>角色</Text>
            <TextInput
              value={memberEditDraft.role}
              onChangeText={(v) => setMemberEditDraft((s) => ({ ...s, role: v }))}
              style={styles.input}
            />
          </View>
        </View>
        <Text style={styles.label}>权限类型</Text>
        <AccessTypePicker
          value={memberEditDraft.access_type}
          onChange={(access_type) => setMemberEditDraft((s) => ({ ...s, access_type }))}
        />
        <Text style={styles.label}>新密码（留空不修改）</Text>
        <TextInput
          value={memberEditDraft.password}
          onChangeText={(v) => setMemberEditDraft((s) => ({ ...s, password: v }))}
          secureTextEntry
          style={styles.input}
        />
        <View style={styles.editMemberActions}>
          {editingMember && editingMember.id !== currentUser?.id ? (
            <Pressable
              onPress={() => confirmDeleteMember(editingMember)}
              style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
            >
              <Ionicons name="trash-outline" size={16} color={colors['safety-red']} />
              <Text style={styles.deleteBtnText}>删除</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button variant="secondary" onPress={() => setEditingMember(null)}>
              取消
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button onPress={submitUpdateMember}>保存</Button>
          </View>
        </View>
      </EditorModal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

function BabyMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.babyMetric}>
      <Text style={styles.babyMetricLabel}>{label}</Text>
      <Text style={styles.babyMetricValue}>{value}</Text>
    </View>
  );
}

function AccessTypePicker({
  value,
  onChange,
}: {
  value: UserAccessType;
  onChange: (value: UserAccessType) => void;
}) {
  return (
    <View style={styles.accessGrid}>
      {ACCESS_TYPES.map((item) => {
        const selected = value === item.value;
        return (
          <Pressable
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[styles.accessCell, selected && styles.accessCellSelected]}
          >
            <Text style={[styles.accessLabel, selected && styles.accessLabelSelected]}>
              {item.label}
            </Text>
            <Text style={[styles.accessCaption, selected && styles.accessCaptionSelected]}>
              {item.caption}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ModalActions({
  onCancel,
  onSubmit,
  submitText,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitText: string;
}) {
  return (
    <View style={styles.modalActions}>
      <View style={{ flex: 1 }}>
        <Button variant="secondary" onPress={onCancel}>
          取消
        </Button>
      </View>
      <View style={{ flex: 1 }}>
        <Button onPress={onSubmit}>{submitText}</Button>
      </View>
    </View>
  );
}

function EditorModal({
  visible,
  title,
  eyebrow,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === 'ios' ? 'slide' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              {eyebrow ? <Text style={styles.modalEyebrow}>{eyebrow}</Text> : null}
              <Text style={styles.modalTitle}>{title}</Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="关闭"
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={18} color={colors['dark-gray']} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors['warm-cream'] },
  scroll: {
    padding: spacing['4'],
    paddingBottom: spacing['12'],
    gap: spacing['4'],
  },
  centerBlock: {
    paddingVertical: spacing['10'],
    alignItems: 'center',
    gap: spacing['3'],
  },
  errorText: { ...typography.body, color: colors['safety-red'] },
  retryBtn: { paddingHorizontal: spacing['4'], paddingVertical: spacing['2'] },
  retryText: { ...typography.body, color: colors['fawn-amber'] },

  // Hero
  heroCard: {
    backgroundColor: colors['card'],
    borderRadius: radii.card,
    padding: spacing['5'],
    borderWidth: borderWidth.hairline,
    borderColor: colors['fawn-amber-light'],
    gap: spacing['3'],
    ...shadows.card,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing['3'],
  },
  heroHeaderMain: { flex: 1, minWidth: 0, gap: spacing['2'] },
  heroTitle: { ...typography.title, color: colors['soft-charcoal'] },
  heroSubtitle: { ...typography.body, color: colors['dark-gray'] },
  heroActions: {
    flexDirection: 'row',
    gap: spacing['2'],
  },

  // Card
  card: {
    backgroundColor: colors['card'],
    borderRadius: radii.card,
    padding: spacing['4'],
    gap: spacing['3'],
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
  },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardEyebrow: { ...typography.bodySmall, color: colors['dark-gray'] },
  cardTitle: { ...typography.heading, color: colors['soft-charcoal'] },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
  },

  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeMint: { backgroundColor: colors['nursery-mint'] },
  headerBadgePowder: { backgroundColor: colors['nursery-powder'] },
  headerBadgeButter: { backgroundColor: colors['nursery-butter'] },

  // Subtle / quiet / icon buttons (Web parity)
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    backgroundColor: colors['card'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['2'],
    minHeight: 36,
    paddingHorizontal: spacing['3'],
    borderRadius: radii.chip,
    backgroundColor: colors['warm-gray'],
  },
  subtleButtonFlex: { flex: 1 },
  subtleButtonText: { ...typography.bodySmall, color: colors['dark-gray'], fontFamily: typography.heading.fontFamily },
  quietAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['1'],
    height: 36,
    paddingHorizontal: spacing['3'],
    borderRadius: radii.chip,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    backgroundColor: colors['card'],
  },
  quietActionText: { ...typography.bodySmall, color: colors['dark-gray'], fontFamily: typography.heading.fontFamily },
  pressed: { opacity: 0.85 },
  pressedRow: { backgroundColor: colors['warm-gray'] },

  // List block (inner border container)
  listBlock: {
    borderRadius: radii.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    overflow: 'hidden',
    backgroundColor: colors['card'],
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors['oat-border'],
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
    padding: spacing['3'],
    textAlign: 'center',
  },

  // Member row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['3'],
  },
  memberMain: { flex: 1.4, minWidth: 0 },
  memberName: { ...typography.body, color: colors['soft-charcoal'], fontFamily: typography.heading.fontFamily },
  memberHandle: { ...typography.caption, color: colors['dark-gray'], marginTop: spacing['1'] },
  memberRole: { ...typography.bodySmall, color: colors['dark-gray'], flex: 0.8, minWidth: 0 },
  memberRight: { flexDirection: 'row', alignItems: 'center', gap: spacing['1'] },
  accessChip: {
    ...typography.caption,
    color: colors['soft-charcoal'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.chip,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    overflow: 'hidden',
    fontFamily: typography.heading.fontFamily,
  },

  // Baby
  babyGrid: { flexDirection: 'row', gap: spacing['2'] },
  babyMetric: {
    flex: 1,
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['3'],
    alignItems: 'center',
    gap: spacing['1'],
  },
  babyMetricLabel: { ...typography.caption, color: colors['dark-gray'] },
  babyMetricValue: { ...typography.body, color: colors['soft-charcoal'], fontFamily: typography.heading.fontFamily },
  babyEmpty: {
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    padding: spacing['4'],
    gap: spacing['3'],
  },
  babyEmptyText: { ...typography.body, color: colors['dark-gray'] },
  babyCreateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    minHeight: 40,
    paddingHorizontal: spacing['4'],
    borderRadius: radii.chip,
    backgroundColor: colors['card'],
    ...shadows.card,
  },
  babyCreateText: { ...typography.body, color: colors['fawn-amber'], fontFamily: typography.heading.fontFamily },

  // Memory row
  memoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['3'],
  },
  memoryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors['warm-gray'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryMain: { flex: 1, minWidth: 0 },
  memoryLabel: { ...typography.body, color: colors['soft-charcoal'], fontFamily: typography.heading.fontFamily },
  memoryMeta: { ...typography.caption, color: colors['dark-gray'], marginTop: spacing['1'] },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors['modal-backdrop'],
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors['card'],
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing['4'],
    maxHeight: '88%',
    ...shadows.modal,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing['3'],
    marginBottom: spacing['3'],
  },
  modalHeaderText: { flex: 1, minWidth: 0 },
  modalEyebrow: { ...typography.bodySmall, color: colors['dark-gray'] },
  modalTitle: { ...typography.heading, color: colors['soft-charcoal'] },
  modalBody: { gap: spacing['2'], paddingBottom: spacing['4'] },
  modalActions: {
    flexDirection: 'row',
    gap: spacing['2'],
    marginTop: spacing['3'],
  },

  // Form
  label: {
    ...typography.caption,
    color: colors['dark-gray'],
    marginTop: spacing['2'],
  },
  input: {
    ...typography.inputBody,
    minHeight: 44,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    borderRadius: radii.lg,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    backgroundColor: colors['card'],
  },
  row2: { flexDirection: 'row', gap: spacing['2'] },
  row3: { flexDirection: 'row', gap: spacing['2'] },
  col: { flex: 1, minWidth: 0 },

  segmented: {
    flexDirection: 'row',
    gap: spacing['1'],
    backgroundColor: colors['warm-gray'],
    padding: spacing['1'],
    borderRadius: radii.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  segmentSelected: { backgroundColor: colors['card'], ...shadows.card },
  segmentText: { ...typography.bodySmall, color: colors['dark-gray'], fontFamily: typography.heading.fontFamily },
  segmentTextSelected: { color: colors['fawn-amber'] },

  accessGrid: { flexDirection: 'row', gap: spacing['2'] },
  accessCell: {
    flex: 1,
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    backgroundColor: colors['card'],
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['2'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['1'],
  },
  accessCellSelected: {
    borderColor: colors['brand-strong'],
    backgroundColor: colors['nursery-mint'],
  },
  accessLabel: { ...typography.bodySmall, color: colors['dark-gray'], fontFamily: typography.heading.fontFamily },
  accessLabelSelected: { color: colors['brand-strong'] },
  accessCaption: { ...typography.caption, color: colors['mid-gray'] },
  accessCaptionSelected: { color: colors['brand-strong'] },

  permGroup: { gap: spacing['2'] },
  permLine: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    backgroundColor: colors['warm-gray'],
    padding: spacing['3'],
    borderRadius: radii.lg,
  },

  editMemberActions: {
    flexDirection: 'row',
    gap: spacing['2'],
    alignItems: 'center',
    marginTop: spacing['3'],
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    minHeight: 44,
    paddingHorizontal: spacing['3'],
    borderRadius: radii.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    backgroundColor: colors['card'],
  },
  deleteBtnText: { ...typography.bodySmall, color: colors['safety-red'], fontFamily: typography.heading.fontFamily },
});
