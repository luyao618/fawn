import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../shared/theme';
import type { SleepStatsDaily, SleepStatsData } from '../../shared/api';
import {
  DailyMetricChart,
  latestActiveWindow,
  type DailyMetricChartSeries,
  StatNumber,
  StatsCard,
} from './StatsCard';

/**
 * Sleep stats card — mobile equivalent of
 * `frontend/src/components/dashboard/SleepStats.tsx`. Highlights the rolling
 * sleep average and the per-day bar series.
 */
export function SleepStats({ data }: { data: SleepStatsData }) {
  const visibleDaily = latestActiveWindow(data.daily, [
    (row) => row.total_hours,
    (row) => row.night_wakings,
  ]);
  const averageDailyHours = averageNullable(visibleDaily.map((row) => row.total_hours));
  const averageNightWakings = averageNullable(
    visibleDaily.map((row) => row.night_wakings),
  );
  const hasAnyData = data.daily.some(
    (row) => row.total_hours != null || row.night_wakings != null,
  );
  const chartSeries = React.useMemo<Array<DailyMetricChartSeries<SleepStatsDaily>>>(
    () => [
      {
        id: 'total_hours',
        label: '睡眠',
        color: colors['info-blue'],
        kind: 'bar',
        axis: 'left',
        unit: 'h',
        getValue: (point) => point.total_hours,
        formatValue: (value) => `${value.toFixed(1)}h`,
      },
      {
        id: 'night_wakings',
        label: '夜醒',
        color: colors['fawn-amber'],
        kind: 'line',
        axis: 'right',
        unit: '次',
        getValue: (point) => point.night_wakings,
        formatValue: (value) => `${Math.round(value)}次`,
      },
    ],
    [],
  );

  return (
    <StatsCard title="睡眠统计">
      <View style={styles.row}>
        <StatNumber
          value={averageDailyHours == null ? '没数据' : averageDailyHours.toFixed(1)}
          label="日均小时"
        />
        <StatNumber
          value={
            averageNightWakings == null
              ? '没数据'
              : averageNightWakings.toFixed(1)
          }
          label="平均夜醒"
        />
      </View>
      {hasAnyData ? (
        <DailyMetricChart
          data={data.daily}
          series={chartSeries}
          leftAxisFormatter={(value) => `${value.toFixed(value < 10 ? 1 : 0)}h`}
          rightAxisFormatter={(value) => `${Math.round(value)}次`}
          emptyLabel="这段时间暂无睡眠记录"
        />
      ) : (
        <Text style={styles.empty}>这段时间暂无睡眠记录</Text>
      )}
    </StatsCard>
  );
}

function averageNullable(values: Array<number | null | undefined>) {
  const numericValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (numericValues.length === 0) return null;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing['4'],
    marginTop: spacing['3'],
  },
  empty: {
    marginTop: spacing['5'],
    textAlign: 'center',
    color: colors['mid-gray'],
  },
});
