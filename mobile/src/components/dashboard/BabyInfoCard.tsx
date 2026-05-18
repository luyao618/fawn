import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../shared/theme';
import type { DashboardSummary } from '../../shared/api';
import { Card } from '../ui/Card';

/**
 * Card showing the baby's name + age — the top-of-page identity strip on the
 * Dashboard. Mirrors `frontend/src/components/dashboard/BabyInfoCard.tsx`.
 *
 * Empty state (no baby on file) keeps the same shape so the Dashboard layout
 * doesn't jump while data loads.
 */
export function BabyInfoCard({ summary }: { summary: DashboardSummary }) {
  if (!summary.baby) {
    return (
      <Card style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLabel}>宝</Text>
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>还没有宝宝档案</Text>
          <Text style={styles.subtitle}>暂无生长数据</Text>
        </View>
      </Card>
    );
  }

  const name = summary.baby.name ?? '宝宝档案';
  const age = summary.baby.age_display ?? '出生日期待填';

  return (
    <Card style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarLabel}>{name.slice(0, 1)}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.subtitle}>{age}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['4'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: colors['nursery-mint'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    ...typography.heading,
    color: colors['brand-strong'],
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.heading,
  },
  subtitle: {
    ...typography.bodySmall,
    marginTop: spacing['1'],
  },
});
