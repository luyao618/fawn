import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../shared/theme';
import type {
  DiaperRecord,
  DiaperStatsDaily,
  DiaperStatsData,
  DiaperType,
} from '../../shared/api';
import { formatDateTime } from '../../lib/utils';
import {
  DailyMetricChart,
  type DailyMetricChartSeries,
  StatNumber,
  StatsCard,
} from './StatsCard';

export const DIAPER_TYPE_LABEL: Record<DiaperType, string> = {
  poop: '大便',
  pee: '小便',
  mixed: '混合',
};

interface DiaperStatsProps {
  data: DiaperStatsData;
  records: DiaperRecord[];
}

export function DiaperStats({ data, records }: DiaperStatsProps) {
  const hasAnyData = data.daily.some((row) => row.total > 0);
  const latest = data.daily[data.daily.length - 1] ?? {
    date: '',
    poop: 0,
    pee: 0,
    mixed: 0,
    total: 0,
  };
  const sortedRecords = React.useMemo(
    () => [...records].sort((left, right) => right.diaper_time.localeCompare(left.diaper_time)),
    [records],
  );
  const chartSeries = React.useMemo<Array<DailyMetricChartSeries<DiaperStatsDaily>>>(
    () => [
      {
        id: 'total',
        label: '总次数',
        color: colors['sage-green'],
        kind: 'bar',
        axis: 'left',
        unit: '次',
        getValue: (point) => point.total,
        formatValue: (value) => `${Math.round(value)}次`,
      },
      {
        id: 'poop',
        label: '大便',
        color: colors['fawn-amber'],
        kind: 'line',
        axis: 'right',
        unit: '次',
        getValue: (point) => point.poop,
        formatValue: (value) => `${Math.round(value)}次`,
      },
      {
        id: 'pee',
        label: '小便',
        color: colors['info-blue'],
        kind: 'line',
        axis: 'right',
        unit: '次',
        getValue: (point) => point.pee,
        formatValue: (value) => `${Math.round(value)}次`,
      },
      {
        id: 'mixed',
        label: '混合',
        color: colors['warning-amber'],
        kind: 'line',
        axis: 'right',
        unit: '次',
        getValue: (point) => point.mixed,
        formatValue: (value) => `${Math.round(value)}次`,
      },
    ],
    [],
  );

  return (
    <StatsCard title="大小便统计">
      <View style={styles.statsRow}>
        <StatNumber value={`${latest.total}`} label="今日总次数" />
        <StatNumber value={`${latest.poop}`} label="大便" />
        <StatNumber value={`${latest.pee}`} label="小便" />
        <StatNumber value={`${latest.mixed}`} label="混合" />
      </View>
      <Text style={styles.averageStrip}>
        {data.days} 日均 {averageLabel(data.average_daily_total)} 次 · 大便{' '}
        {averageLabel(data.average_daily_poop)} · 小便 {averageLabel(data.average_daily_pee)} · 混合{' '}
        {averageLabel(data.average_daily_mixed)}
      </Text>

      {hasAnyData ? (
        <DailyMetricChart
          data={data.daily}
          series={chartSeries}
          leftAxisFormatter={(value) => `${Math.round(value)}次`}
          rightAxisFormatter={(value) => `${Math.round(value)}次`}
          emptyLabel="这段时间暂无大小便记录"
        />
      ) : (
        <Text style={styles.empty}>这段时间暂无大小便记录</Text>
      )}

      <View style={styles.history}>
        <Text style={styles.historyTitle}>大小便历史</Text>
        {sortedRecords.length === 0 ? <Text style={styles.emptySmall}>暂无记录</Text> : null}
        {sortedRecords.map((record) => (
          <View key={record.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>
                {formatDateTime(record.diaper_time)} {DIAPER_TYPE_LABEL[record.diaper_type]}
              </Text>
              {record.notes ? (
                <Text style={styles.rowDetail} numberOfLines={2}>
                  {record.notes}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </StatsCard>
  );
}

function averageLabel(value: number) {
  return value.toFixed(1).replace(/\.0$/, '');
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing['2'],
    marginTop: spacing['3'],
  },
  averageStrip: {
    ...typography.caption,
    color: colors['dark-gray'],
    backgroundColor: colors['nursery-mint'],
    borderRadius: radii.md,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    marginTop: spacing['3'],
  },
  empty: {
    marginTop: spacing['5'],
    textAlign: 'center',
    color: colors['mid-gray'],
  },
  history: {
    marginTop: spacing['5'],
    gap: spacing['3'],
  },
  historyTitle: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    fontWeight: '600',
  },
  row: {
    borderRadius: radii.lg,
    backgroundColor: colors['warm-gray'],
    padding: spacing['3'],
  },
  rowMain: {
    gap: spacing['1'],
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  rowDetail: {
    ...typography.caption,
    color: colors['dark-gray'],
  },
  emptySmall: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
    textAlign: 'center',
    paddingVertical: spacing['2'],
  },
});
