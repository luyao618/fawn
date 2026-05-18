/**
 * GrowthHistoryList — RN-idiomatic port of
 * frontend/src/components/dashboard/GrowthHistoryList.tsx.
 *
 * PORT DECISION: chartRange.ts deferred — no current mobile consumer; mobile
 * GrowthChart.tsx is View-based with no brush/range gesture. Revisit if mobile
 * gains brush.
 *
 * Consumed by DashboardScreen (Phase 4 IA migration).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GrowthRecord } from '../../shared/api/types';
import { colors, fontFamily, radii, spacing, typography } from '../../shared/theme';

interface GrowthHistoryListProps {
  records: GrowthRecord[];
  onEdit?: (record: GrowthRecord) => void;
  onDelete?: (record: GrowthRecord) => void;
}

function toKg(weightG: number | null | undefined): string {
  if (weightG == null) return '暂无';
  return `${(weightG / 1000).toFixed(1)}kg`;
}

function formatDate(date: string): string {
  // date is typically YYYY-MM-DD
  return date;
}

export function GrowthHistoryList({ records, onEdit, onDelete }: GrowthHistoryListProps) {
  const sorted = [...records].sort((a, b) =>
    b.measurement_date.localeCompare(a.measurement_date),
  );

  if (sorted.length === 0) {
    return (
      <Text style={styles.empty}>暂无成长记录</Text>
    );
  }

  return (
    <View style={styles.list}>
      {sorted.map((record) => {
        const fields: string[] = [];
        if (record.weight_g != null) fields.push(toKg(record.weight_g));
        if (record.height_cm != null) fields.push(`${record.height_cm}cm`);
        if (record.head_cm != null) fields.push(`头围 ${record.head_cm}cm`);

        return (
          <View key={record.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.dateText}>{formatDate(record.measurement_date)}</Text>
              {fields.length > 0 && (
                <Text style={styles.fieldText}>{fields.join(' · ')}</Text>
              )}
              {record.notes ? (
                <Text style={styles.notes}>{record.notes}</Text>
              ) : null}
            </View>
            {(onEdit || onDelete) ? (
              <View style={styles.actions}>
                {onEdit ? (
                  <Pressable
                    onPress={() => onEdit(record)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`编辑 ${record.measurement_date} 成长记录`}
                    style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                  >
                    <Ionicons name="pencil-outline" size={14} color={colors['dark-gray']} />
                  </Pressable>
                ) : null}
                {onDelete ? (
                  <Pressable
                    onPress={() => onDelete(record)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`删除 ${record.measurement_date} 成长记录`}
                    style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors['safety-red']} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing['2'],
  },
  empty: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
    textAlign: 'center',
    paddingVertical: spacing['4'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing['3'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing['1'],
  },
  dateText: {
    fontSize: 13,
    fontFamily: fontFamily.sansSemibold,
    color: colors['soft-charcoal'],
    lineHeight: 18,
  },
  fieldText: {
    ...typography.caption,
    color: colors['dark-gray'],
  },
  notes: {
    ...typography.caption,
    color: colors['mid-gray'],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing['1'],
    flexShrink: 0,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors['card'],
  },
});
