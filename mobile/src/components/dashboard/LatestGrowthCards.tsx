import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radii, spacing, typography } from '../../shared/theme';
import type {
  DashboardLatestGrowth,
  DashboardLatestGrowthMetric,
} from '../../shared/api';

/**
 * Compact inline strip showing the latest weight / height / head measurements.
 * It stays visually quiet so the summary stack reads as one cohesive set of
 * warm dashboard cards.
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
      <View style={[styles.metric, styles.metricMuted]}>
        <Text style={[styles.label, styles.labelMuted]}>{label}</Text>
        <Text style={[styles.value, styles.valueMuted]}>--</Text>
      </View>
    );
  }
  return (
    <View style={styles.metric}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={styles.value}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {formatValue(metric, unit)}
      </Text>
      {metric.percentile != null ? (
        <Text style={styles.percentile} numberOfLines={1}>
          P{metric.percentile}
        </Text>
      ) : null}
    </View>
  );
}

export function LatestGrowthCards({ latest }: { latest: DashboardLatestGrowth | null }) {
  if (latest === null) {
    return (
      <View style={styles.pill}>
        <MetricInline label="体重" unit="kg" metric={null} />
        <MetricInline label="身高" unit="cm" metric={null} />
        <MetricInline label="头围" unit="cm" metric={null} />
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
    borderWidth: 1,
    borderColor: colors['oat-border'],
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['3'],
  },
  metric: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  metricMuted: {
    opacity: 0.7,
  },
  label: {
    ...typography.metaXs,
    color: colors['dark-gray'],
  },
  labelMuted: {
    color: colors['mid-gray'],
  },
  value: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: colors['soft-charcoal'],
    marginTop: spacing['2'],
  },
  valueMuted: {
    color: colors['mid-gray'],
    fontWeight: '500',
  },
  percentile: {
    ...typography.caption,
    color: colors['sage-green'],
    marginTop: spacing['1'],
  },
});
