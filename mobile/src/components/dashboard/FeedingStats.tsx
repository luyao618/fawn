import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../shared/theme';
import type { FeedingStatsDaily, FeedingStatsData } from '../../shared/api';
import {
  DailyMetricChart,
  latestActiveWindow,
  type DailyMetricChartSeries,
  StatNumber,
  StatsCard,
} from './StatsCard';

/**
 * Feeding stats card — mobile equivalent of
 * `frontend/src/components/dashboard/FeedingStats.tsx`. Shows day-over-day
 * formula volume and the rolling averages above.
 *
 * The chart mirrors Web's composed chart: formula volume bars plus breast
 * duration and count trend lines, with a selected-day detail panel.
 */
export function FeedingStats({ data }: { data: FeedingStatsData }) {
  const visibleDaily = latestActiveWindow(data.daily, [
    (row) => row.total_ml,
    (row) => row.breast_duration_min,
    (row) => row.count,
  ]);
  const averageDailyMl = average(visibleDaily.map((row) => row.total_ml));
  const averageDailyBreastDuration = average(
    visibleDaily.map((row) => row.breast_duration_min),
  );
  const averageDailyCount = average(visibleDaily.map((row) => row.count));
  const chartSeries = React.useMemo<Array<DailyMetricChartSeries<FeedingStatsDaily>>>(
    () => [
      {
        id: 'total_ml',
        label: '配方奶量',
        color: colors['fawn-amber'],
        kind: 'bar',
        axis: 'left',
        unit: 'ml',
        getValue: (point) => point.total_ml,
        formatValue: (value) => `${Math.round(value)}ml`,
      },
      {
        id: 'breast_duration_min',
        label: '亲喂时长',
        color: colors['info-blue'],
        kind: 'line',
        axis: 'right',
        unit: '分钟',
        getValue: (point) => point.breast_duration_min,
        formatValue: (value) => `${Math.round(value)}分钟`,
      },
      {
        id: 'count',
        label: '次数',
        color: colors['sage-green'],
        kind: 'line',
        axis: 'hidden',
        unit: '次',
        getValue: (point) => point.count,
        formatValue: (value) => `${value.toFixed(1).replace(/\.0$/, '')}次`,
      },
    ],
    [],
  );

  return (
    <StatsCard title="喂养统计">
      <View style={styles.row}>
        <StatNumber
          value={`${Math.round(averageDailyMl)}`}
          label="日均配方奶 ml"
        />
        <StatNumber
          value={`${Math.round(averageDailyBreastDuration)}`}
          label="日均亲喂分钟"
        />
        <StatNumber
          value={averageDailyCount.toFixed(1)}
          label="日均次数"
        />
      </View>
      {data.daily.length > 0 ? (
        <DailyMetricChart
          data={data.daily}
          series={chartSeries}
          leftAxisFormatter={(value) => `${Math.round(value)}ml`}
          rightAxisFormatter={(value) => `${Math.round(value)}分`}
          emptyLabel="这段时间暂无喂养记录"
        />
      ) : (
        <Text style={styles.empty}>这段时间暂无喂养记录</Text>
      )}
    </StatsCard>
  );
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing['3'],
    marginTop: spacing['3'],
  },
  empty: {
    marginTop: spacing['5'],
    textAlign: 'center',
    color: colors['mid-gray'],
  },
});
