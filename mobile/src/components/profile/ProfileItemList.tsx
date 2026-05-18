/**
 * ProfileItemList — RN-idiomatic port of
 * frontend/src/components/profile/ProfileItemList.tsx.
 *
 * Renders a card with a list of profile items (personal memory records),
 * supporting inline add / edit / delete. Uses Avatar for the header icon.
 */

import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { colors, fontFamily, radii, spacing, typography } from '../../shared/theme';

export interface ProfileItem {
  id: string;
  content: string;
  updated_at: string;
}

interface ProfileItemListProps {
  items: ProfileItem[];
  onEdit?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onAdd?: (content: string) => Promise<void>;
  eyebrow?: string;
  title?: string;
  emptyText?: string;
}

function formatDateTime(ts: string): string {
  try {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return ts;
  }
}

export function ProfileItemList({
  items,
  onEdit,
  onDelete,
  onAdd,
  eyebrow = '个性化记忆',
  title = '我的画像',
  emptyText = '暂无记录',
}: ProfileItemListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [draft, setDraft] = useState('');

  function beginEdit(item: ProfileItem) {
    setEditingId(item.id);
    setEditContent(item.content);
  }

  async function submitEdit() {
    if (!editingId || !onEdit) return;
    await onEdit(editingId, editContent);
    setEditingId(null);
  }

  async function submitAdd() {
    if (!onAdd || !draft.trim()) return;
    await onAdd(draft.trim());
    setDraft('');
  }

  return (
    <Card>
      {/* Header */}
      <View style={styles.header}>
        <Avatar role="parent" size="md" />
        <View>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.heading}>{title}</Text>
        </View>
      </View>

      {/* Add row */}
      {onAdd ? (
        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="添加一条记忆"
            placeholderTextColor={colors['mid-gray']}
            style={styles.addInput}
          />
          <Button variant="secondary" onPress={submitAdd}>
            添加
          </Button>
        </View>
      ) : null}

      {/* Items */}
      <View style={styles.list}>
        {items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        ) : null}
        {items.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            {editingId === item.id ? (
              <View style={styles.editBlock}>
                <TextInput
                  value={editContent}
                  onChangeText={setEditContent}
                  multiline
                  style={styles.editInput}
                />
                <View style={styles.editActions}>
                  <Button variant="text" onPress={() => setEditingId(null)}>
                    取消
                  </Button>
                  <Button variant="primary" onPress={submitEdit}>
                    保存
                  </Button>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.itemContent}>{item.content}</Text>
                <View style={styles.itemMeta}>
                  <Text style={styles.itemDate}>更新于 {formatDateTime(item.updated_at)}</Text>
                  <View style={styles.itemActions}>
                    {onEdit ? (
                      <Pressable
                        onPress={() => beginEdit(item)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="编辑画像"
                        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors['fawn-amber']} />
                      </Pressable>
                    ) : null}
                    {onDelete ? (
                      <Pressable
                        onPress={() =>
                          Alert.alert('确认删除', '确认删除这条记忆？', [
                            { text: '取消', style: 'cancel' },
                            { text: '删除', style: 'destructive', onPress: () => void onDelete(item.id) },
                          ])
                        }
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="删除画像"
                        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors['safety-red']} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    marginBottom: spacing['4'],
  },
  eyebrow: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  heading: {
    fontSize: 17,
    fontFamily: fontFamily.sansSemibold,
    color: colors['soft-charcoal'],
    lineHeight: 22,
  },
  addRow: {
    flexDirection: 'row',
    gap: spacing['2'],
    marginBottom: spacing['3'],
    alignItems: 'center',
  },
  addInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.input,
    backgroundColor: colors['card'],
    paddingHorizontal: spacing['3'],
    ...typography.body,
  },
  list: {
    gap: spacing['3'],
  },
  emptyBox: {
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    padding: spacing['3'],
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  itemCard: {
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    padding: spacing['3'],
  },
  itemContent: {
    ...typography.body,
    color: colors['soft-charcoal'],
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing['2'],
  },
  itemDate: {
    ...typography.caption,
    color: colors['mid-gray'],
  },
  itemActions: {
    flexDirection: 'row',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors['warm-cream'],
  },
  editBlock: {
    gap: spacing['2'],
  },
  editInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.lg,
    backgroundColor: colors['card'],
    padding: spacing['3'],
    ...typography.body,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing['2'],
  },
});
