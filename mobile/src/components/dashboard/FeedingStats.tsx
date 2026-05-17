import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../shared/theme';
import type { FeedingStatsData } from '../../shared/api';
import { MiniBarChart, StatNumber, StatsCard } from './StatsCard';

/**
 * Feeding stats card — mobile equivalent of
 * `frontend/src/components/dashboard/FeedingStats.tsx`. Shows day-over-day
 * formula volume and the rolling averages above.
 *
 * Web charts a secondary line series for breast duration; on mobile we keep a
 * single bar series (configurable rolling window) so the visual stays legible
 * on small screens — the per-row averages already cover breast minutes.
 */
export function FeedingStats({ data }: { data: FeedingStatsData }) {
  return (
    <StatsCard title="喂养统计">
      <View style={styles.row}>
        <StatNumber
          value={`${Math.round(data.average_daily_ml)}`}
          label="日均配方奶 ml"
        />
        <StatNumber
          value={`${Math.round(data.average_daily_breast_duration_min)}`}
          label="日均亲喂分钟"
        />
        <StatNumber
          value={data.average_daily_count.toFixed(1)}
          label="日均次数"
        />
      </View>
      {data.daily.length > 0 ? (
        <MiniBarChart
          values={data.daily.map((point) => ({ date: point.date, value: point.total_ml }))}
          color={colors['fawn-amber']}
        />
      ) : (
        <Text style={styles.empty}>这段时间暂无喂养记录</Text>
      )}
    </StatsCard>
  );
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
