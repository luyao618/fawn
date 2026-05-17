import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radii, spacing, typography } from '../../shared/theme';
import type {
  DashboardLatestGrowth,
  DashboardLatestGrowthMetric,
} from '../../shared/api';

/**
 * Three-up snapshot of the latest weight / height / head measurements. Mirrors
 * `frontend/src/components/dashboard/LatestGrowthCards.tsx` — the Web version
 * uses a single warm-gray pill with three inline metrics.
 */

interface MetricProps {
  label: string;
  unit: 'kg' | 'cm';
  metric: DashboardLatestGrowthMetric | null;
}

function formatValue(metric: DashboardLatestGrowthMetric, unit: 'kg' | 'cm') {
  if (unit === 'kg') return `${(metric.value / 1000).toFixed(2)}kg`;
  return `${metric.value}${unit}`;
}

function MetricInline({ label, unit, metric }: MetricProps) {
  if (!metric) {
    return (
      <View style={styles.metric}>
        <Text style={[styles.label, styles.labelMuted]}>{label}</Text>
        <Text style={[styles.value, styles.valueMuted]}>--</Text>
      </View>
    );
  }
  return (
    <View style={styles.metric}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{formatValue(metric, unit)}</Text>
        {metric.percentile != null ? (
          <Text style={styles.percentile}>P{metric.percentile}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function LatestGrowthCards({ latest }: { latest: DashboardLatestGrowth | null }) {
  if (latest === null) {
    return (
      <View style={styles.pill}>
        <Text style={[styles.label, styles.labelMuted]}>最新成长 · 暂无记录</Text>
      </View>
    );
  }
  return (
    <View style={styles.pill}>
      <MetricInline label="体重" unit="kg" metric={latest.weight} />
      <MetricInline label="身高" unit="cm" metric={latest.height} />
      <MetricInline label="头围" unit="cm" metric={latest.head} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  metric: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    ...typography.caption,
    color: colors['dark-gray'],
  },
  labelMuted: {
    color: colors['mid-gray'],
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing['1'],
  },
  value: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '700',
    color: colors['soft-charcoal'],
  },
  valueMuted: {
    color: colors['mid-gray'],
    fontWeight: '500',
  },
  percentile: {
    ...typography.caption,
    color: colors['sage-green'],
  },
});
