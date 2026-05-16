import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type {
  DashboardLatestGrowth,
  DashboardLatestGrowthMetric,
} from '../shared/api';

interface Props {
  latest: DashboardLatestGrowth | null;
}

function formatValue(metric: DashboardLatestGrowthMetric, unit: 'kg' | 'cm'): string {
  if (unit === 'kg') return `${(metric.value / 1000).toFixed(2)}kg`;
  return `${metric.value}${unit}`;
}

function Metric({
  label,
  unit,
  metric,
}: {
  label: string;
  unit: 'kg' | 'cm';
  metric: DashboardLatestGrowthMetric | null;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, !metric && styles.metricValueEmpty]}>
        {metric ? formatValue(metric, unit) : '--'}
        {metric?.percentile != null ? (
          <Text style={styles.percentile}> P{metric.percentile}</Text>
        ) : null}
      </Text>
    </View>
  );
}

export function LatestGrowthCard({ latest }: Props) {
  if (latest === null) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyLabel}>最新成长 · 暂无记录</Text>
      </View>
    );
  }

  const dateIso =
    latest.weight?.date ?? latest.height?.date ?? latest.head?.date ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>最新成长</Text>
        {dateIso ? (
          <Text style={styles.date}>{formatDate(dateIso)}</Text>
        ) : null}
      </View>
      <View style={styles.row}>
        <Metric label="体重" unit="kg" metric={latest.weight} />
        <View style={styles.divider} />
        <Metric label="身高" unit="cm" metric={latest.height} />
        <View style={styles.divider} />
        <Metric label="头围" unit="cm" metric={latest.head} />
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  date: {
    fontSize: 11,
    color: '#999',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  metricValueEmpty: {
    color: '#bbb',
    fontWeight: '500',
  },
  percentile: {
    fontSize: 11,
    color: '#2c7a4b',
    fontWeight: '400',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: '#e8e3dd',
  },
  empty: {
    backgroundColor: '#f7f5f2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyLabel: {
    fontSize: 12,
    color: '#999',
  },
});
