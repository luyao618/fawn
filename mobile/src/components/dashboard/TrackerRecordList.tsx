/**
 * TrackerRecordList — RN-idiomatic port of
 * frontend/src/components/dashboard/TrackerRecordList.tsx.
 *
 * Renders a tabbed list of tracker records (growth/feeding/sleep/health) with
 * optional edit and delete actions. Uses Card + Button primitives.
 *
 * Consumed by DashboardScreen (Phase 4 IA migration).
 */

import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type {
  FeedingRecord,
  GrowthRecord,
  HealthRecord,
  SleepRecord,
} from '../../shared/api/types';
import { colors, fontFamily, radii, spacing, typography } from '../../shared/theme';

export type TrackerType = 'growth' | 'feeding' | 'sleep' | 'health';
export type TrackerRecord = GrowthRecord | FeedingRecord | SleepRecord | HealthRecord;

interface TrackerRecordListProps {
  type: TrackerType;
  records: TrackerRecord[];
  onTypeChange?: (type: TrackerType) => void;
  onEdit: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  canWrite: boolean;
}

const TABS: Array<{ type: TrackerType; label: string }> = [
  { type: 'growth', label: '生长' },
  { type: 'feeding', label: '喂养' },
  { type: 'sleep', label: '睡眠' },
  { type: 'health', label: '健康' },
];

const FEED_TYPE_LABEL: Record<FeedingRecord['feed_type'], string> = {
  breast: '母乳',
  formula: '配方奶',
  solid: '辅食',
};

function formatDateTime(ts: string): string {
  try {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return ts;
  }
}

function toKg(weightG: number | null | undefined): string {
  if (weightG == null) return '暂无';
  return `${(weightG / 1000).toFixed(1)}kg`;
}

function summarize(type: TrackerType, record: TrackerRecord): string {
  if (type === 'growth') {
    const item = record as GrowthRecord;
    return `${item.measurement_date} · ${toKg(item.weight_g)} · ${item.height_cm ?? '暂无'}cm`;
  }
  if (type === 'feeding') {
    const item = record as FeedingRecord;
    const amount =
      item.amount_ml != null
        ? `${item.amount_ml}ml`
        : item.duration_min != null
          ? `${item.duration_min}分钟`
          : '未填写数量';
    return `${formatDateTime(item.feed_time)} · ${FEED_TYPE_LABEL[item.feed_type]} · ${amount}`;
  }
  if (type === 'sleep') {
    const item = record as SleepRecord;
    return `${formatDateTime(item.sleep_start)} · ${item.sleep_type === 'night' ? '夜间睡眠' : '小睡'} · 夜醒 ${item.night_wakings} 次`;
  }
  const item = record as HealthRecord;
  return `${item.record_date} · ${item.title}`;
}

export function TrackerRecordList({
  type,
  records,
  onTypeChange,
  onEdit,
  onDelete,
  canWrite,
}: TrackerRecordListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState('');

  function beginEdit(record: TrackerRecord) {
    setEditingId(record.id);
    const { id: _id, ...editable } = record as unknown as Record<string, unknown>;
    setEditJson(JSON.stringify(editable, null, 2));
  }

  async function submitEdit() {
    if (!editingId) return;
    try {
      const updates = JSON.parse(editJson) as Record<string, unknown>;
      await onEdit(editingId, updates);
      setEditingId(null);
    } catch {
      Alert.alert('JSON 格式错误', '请检查输入格式');
    }
  }

  return (
    <Card>
      <Text style={styles.heading}>Tracker 记录</Text>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.type}
            onPress={() => onTypeChange?.(tab.type)}
            style={[styles.tab, type === tab.type && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: type === tab.type }}
          >
            <Text style={[styles.tabLabel, type === tab.type && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Records */}
      <View style={styles.list}>
        {records.length === 0 ? (
          <Text style={styles.empty}>暂无记录</Text>
        ) : null}
        {records.map((record) => (
          <View key={record.id} style={styles.recordRow}>
            <View style={styles.recordMain}>
              <Text style={styles.recordSummary}>{summarize(type, record)}</Text>
            </View>
            {canWrite ? (
              <View style={styles.recordActions}>
                <Pressable
                  onPress={() => beginEdit(record)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="编辑记录"
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors['fawn-amber']} />
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert('确认删除', '确认删除这条记录？', [
                      { text: '取消', style: 'cancel' },
                      { text: '删除', style: 'destructive', onPress: () => void onDelete(record.id) },
                    ])
                  }
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="删除记录"
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                >
                  <Ionicons name="trash-outline" size={16} color={colors['safety-red']} />
                </Pressable>
              </View>
            ) : null}

            {editingId === record.id ? (
              <View style={styles.editBlock}>
                <ScrollView>
                  <TextInput
                    value={editJson}
                    onChangeText={setEditJson}
                    multiline
                    style={styles.editInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </ScrollView>
                <View style={styles.editActions}>
                  <Button variant="text" onPress={() => setEditingId(null)}>
                    取消
                  </Button>
                  <Button variant="primary" onPress={submitEdit}>
                    保存
                  </Button>
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 17,
    fontFamily: fontFamily.sansSemibold,
    color: colors['soft-charcoal'],
    marginBottom: spacing['3'],
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    padding: spacing['1'],
    marginBottom: spacing['3'],
  },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors['card'],
    ...{
      shadowColor: '#0D1C2E',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
  },
  tabLabel: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  tabLabelActive: {
    color: colors['fawn-amber'],
    fontFamily: fontFamily.sansSemibold,
  },
  list: {
    gap: spacing['3'],
  },
  empty: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
    textAlign: 'center',
    paddingVertical: spacing['4'],
  },
  recordRow: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    backgroundColor: colors['warm-cream'],
    padding: spacing['3'],
    gap: spacing['2'],
  },
  recordMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing['3'],
  },
  recordSummary: {
    ...typography.bodySmall,
    color: colors['soft-charcoal'],
    flex: 1,
    minWidth: 0,
  },
  recordActions: {
    flexDirection: 'row',
    gap: spacing['1'],
    flexShrink: 0,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors['warm-gray'],
  },
  editBlock: {
    gap: spacing['2'],
    marginTop: spacing['2'],
  },
  editInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.lg,
    backgroundColor: colors['card'],
    padding: spacing['3'],
    fontFamily: fontFamily.mono,
    fontSize: 12,
    lineHeight: 18,
    color: colors['soft-charcoal'],
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing['2'],
  },
});
