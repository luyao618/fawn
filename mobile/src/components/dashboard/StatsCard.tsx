import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radii, shadows, spacing, typography } from '../../shared/theme';

/**
 * Shared chrome for Dashboard cards — mobile equivalent of Web `<Card>`.
 */
export function StatsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

interface MiniBarChartProps {
  /** Bars are drawn left to right; older dates first. */
  values: Array<{ date: string; value: number | null }>;
  color: string;
  height?: number;
}

/**
 * Lightweight RN-only bar chart used by `FeedingStats` and `SleepStats`. We
 * avoid `recharts` because that's a Web-only dependency; the layouts here are
 * simple enough that View-based bars are sufficient on phone canvas widths.
 */
export function MiniBarChart({ values, color, height = 140 }: MiniBarChartProps) {
  const numericValues = values
    .map((point) => point.value)
    .filter((value): value is number => typeof value === 'number');
  const max = Math.max(0, ...numericValues);
  const safeMax = max === 0 ? 1 : max;

  return (
    <View style={[styles.barRow, { height }]}>
      {values.map((point, idx) => {
        const ratio = point.value == null ? 0 : Math.max(0, point.value) / safeMax;
        return (
          <View key={`${point.date}-${idx}`} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  height: `${ratio * 100}%`,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

export function StatNumber({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statNumberBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  title: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing['1'],
    marginTop: spacing['4'],
  },
  barSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  statNumberBlock: {
    minWidth: 0,
  },
  statValue: {
    fontFamily: fontFamily.mono,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: colors['soft-charcoal'],
  },
  statLabel: {
    ...typography.caption,
    color: colors['dark-gray'],
    marginTop: spacing['1'],
  },
});
