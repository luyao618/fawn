import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../shared/theme';
import type { SleepStatsData } from '../../shared/api';
import { MiniBarChart, StatNumber, StatsCard } from './StatsCard';

/**
 * Sleep stats card — mobile equivalent of
 * `frontend/src/components/dashboard/SleepStats.tsx`. Highlights the rolling
 * sleep average and the per-day bar series.
 */
export function SleepStats({ data }: { data: SleepStatsData }) {
  const hasAnyData = data.daily.some(
    (row) => row.total_hours != null || row.night_wakings != null,
  );

  return (
    <StatsCard title="睡眠统计">
      <View style={styles.row}>
        <StatNumber
          value={data.average_daily_hours == null ? '没数据' : data.average_daily_hours.toFixed(1)}
          label="日均小时"
        />
        <StatNumber
          value={
            data.average_night_wakings == null
              ? '没数据'
              : data.average_night_wakings.toFixed(1)
          }
          label="平均夜醒"
        />
      </View>
      {hasAnyData ? (
        <MiniBarChart
          values={data.daily.map((point) => ({
            date: point.date,
            value: point.total_hours,
          }))}
          color={colors['info-blue']}
        />
      ) : (
        <Text style={styles.empty}>这段时间暂无睡眠记录</Text>
      )}
    </StatsCard>
  );
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
