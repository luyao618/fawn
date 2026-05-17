import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadows, spacing, typography } from '../../shared/theme';
import type { HealthRecord } from '../../shared/api';

/**
 * Health timeline card — mobile equivalent of
 * `frontend/src/components/dashboard/HealthTimeline.tsx`. Renders the records
 * sorted reverse-chronologically with a colored leading icon per record type.
 */

const ICON_BY_TYPE: Record<HealthRecord['record_type'], React.ComponentProps<typeof Ionicons>['name']> = {
  vaccination: 'medkit-outline',
  illness: 'thermometer-outline',
  checkup: 'calendar-outline',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function HealthTimeline({ records }: { records: HealthRecord[] }) {
  const sorted = [...records].sort(
    (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime(),
  );

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>健康时间线</Text>
      {sorted.length === 0 ? (
        <Text style={styles.empty}>暂无健康记录</Text>
      ) : (
        <View style={styles.list}>
          {sorted.map((record, idx) => (
            <View
              key={record.id}
              style={[
                styles.row,
                idx === sorted.length - 1 ? styles.rowLast : null,
              ]}
            >
              <View style={styles.iconBubble}>
                <Ionicons
                  name={ICON_BY_TYPE[record.record_type]}
                  size={18}
                  color={colors['sage-green']}
                />
              </View>
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={2}>
                  {record.title}
                </Text>
                <Text style={styles.date}>{formatDate(record.record_date)}</Text>
                {record.description ? (
                  <Text style={styles.description}>{record.description}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing['4'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
    ...shadows.card,
  },
  heading: {
    ...typography.heading,
    marginBottom: spacing['3'],
  },
  list: {
    gap: spacing['4'],
  },
  row: {
    flexDirection: 'row',
    gap: spacing['3'],
    paddingBottom: spacing['3'],
    borderBottomWidth: 1,
    borderBottomColor: colors['oat-border'],
  },
  rowLast: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors['sage-green-light'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.body,
    fontWeight: '600',
  },
  date: {
    ...typography.caption,
    marginTop: spacing['1'],
  },
  description: {
    ...typography.bodySmall,
    marginTop: spacing['1'],
  },
  empty: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
    textAlign: 'center',
    paddingVertical: spacing['4'],
  },
});
