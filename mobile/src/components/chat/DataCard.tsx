/**
 * DataCard — RN-idiomatic port of frontend/src/components/chat/DataCard.tsx.
 *
 * Renders a structured data summary card embedded in the chat message list,
 * used when the agent replies with structured growth/feeding/sleep/health data.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { colors, fontFamily, radii, spacing, typography } from '../../shared/theme';

export interface DataCardProps {
  type: 'growth' | 'feeding' | 'sleep' | 'health';
  data: Record<string, unknown>;
}

function safeValue(data: Record<string, unknown>, key: string, fallback = '暂无'): string {
  const raw = data[key];
  if (raw === null || raw === undefined || raw === '') return fallback;
  return String(raw);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const TITLE: Record<DataCardProps['type'], string> = {
  growth: '生长记录',
  feeding: '喂养统计',
  sleep: '睡眠统计',
  health: '健康事件',
};

const ICON: Record<DataCardProps['type'], React.ComponentProps<typeof Ionicons>['name']> = {
  growth: 'resize-outline',
  feeding: 'pulse-outline',
  sleep: 'moon-outline',
  health: 'medkit-outline',
};

export function DataCard({ type, data }: DataCardProps) {
  const weight =
    typeof data.weight_g === 'number'
      ? `${(data.weight_g / 1000).toFixed(1)}kg`
      : safeValue(data, 'weight_g');

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name={ICON[type]} size={18} color={colors['brand-strong']} />
        <Text style={styles.title}>{TITLE[type]}</Text>
      </View>

      {type === 'growth' && (
        <View style={styles.grid3}>
          <Stat label="体重" value={weight} />
          <Stat label="身高" value={`${safeValue(data, 'height_cm')}cm`} />
          <Stat label="WHO" value={`${safeValue(data, 'weight_percentile')}%`} />
        </View>
      )}

      {type === 'feeding' && (
        <View style={styles.grid3}>
          <Stat label="配方奶" value={`${safeValue(data, 'total_ml')}ml`} />
          <Stat label="亲喂" value={`${safeValue(data, 'breast_duration_min')}分`} />
          <Stat label="次数" value={`${safeValue(data, 'count')}次`} />
        </View>
      )}

      {type === 'sleep' && (
        <View style={styles.grid2}>
          <Stat label="睡眠" value={`${safeValue(data, 'total_hours')}h`} />
          <Stat label="夜醒" value={`${safeValue(data, 'night_wakings')}次`} />
        </View>
      )}

      {type === 'health' && (
        <View style={styles.healthBlock}>
          <Text style={styles.healthTitle}>{safeValue(data, 'title')}</Text>
          <Text style={styles.healthDesc}>{safeValue(data, 'description')}</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing['3'],
    maxWidth: '85%',
    gap: spacing['3'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
  },
  title: {
    ...typography.bodySmall,
    fontFamily: fontFamily.sansSemibold,
    color: colors['soft-charcoal'],
  },
  grid3: {
    flexDirection: 'row',
    gap: spacing['3'],
  },
  grid2: {
    flexDirection: 'row',
    gap: spacing['4'],
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    ...typography.caption,
    color: colors['dark-gray'],
  },
  statValue: {
    fontFamily: fontFamily.mono,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: colors['soft-charcoal'],
  },
  healthBlock: {
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.md,
    padding: spacing['3'],
    gap: spacing['1'],
  },
  healthTitle: {
    ...typography.bodySmall,
    fontFamily: fontFamily.sansSemibold,
    color: colors['soft-charcoal'],
  },
  healthDesc: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
});
