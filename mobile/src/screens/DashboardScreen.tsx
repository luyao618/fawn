import { useQueries } from '@tanstack/react-query';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DashboardOverview } from '../components/dashboard/DashboardOverview';
import { DiaperStats } from '../components/dashboard/DiaperStats';
import { FeedingStats } from '../components/dashboard/FeedingStats';
import { HealthTimeline } from '../components/dashboard/HealthTimeline';
import { LatestGrowthCards } from '../components/dashboard/LatestGrowthCards';
import { SleepStats } from '../components/dashboard/SleepStats';
import { StatsCard } from '../components/dashboard/StatsCard';
import {
  RecentRecords,
  buildRecentRecords,
} from '../components/dashboard/RecentRecords';
import { TopBar } from '../components/layout/TopBar';
import {
  dashboardQueries,
  growthQueries,
  trackerQueries,
} from '../shared/api';
import { formatDateTime } from '../lib/utils';
import type {
  FeedingRecord,
  FeedingStatsData,
  SleepRecord,
  SleepStatsData,
} from '../shared/api';
import { colors, radii, spacing, typography } from '../shared/theme';

const STATS_HISTORY_DAYS = 90;

const DASHBOARD_SECTIONS = [
  '摘要',
  '喂养',
  '大小便',
  '睡眠',
  '健康',
] as const;

type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

const FEEDING_TYPE_LABEL: Record<FeedingRecord['feed_type'], string> = {
  breast: '母乳',
  formula: '配方奶',
  solid: '辅食',
};

const SLEEP_TYPE_LABEL: Record<SleepRecord['sleep_type'], string> = {
  night: '夜睡',
  nap: '小睡',
};

function safeTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortByTimeDesc<T>(records: T[], getTime: (record: T) => string): T[] {
  return [...records].sort(
    (left, right) => safeTime(getTime(right)) - safeTime(getTime(left)),
  );
}

function formatFeedingMetric(record: FeedingRecord): string {
  const parts: string[] = [];
  if (record.amount_ml != null) parts.push(`${Math.round(record.amount_ml)}ml`);
  if (record.duration_min != null) parts.push(`${Math.round(record.duration_min)}分钟`);
  return parts.length > 0 ? parts.join(' / ') : '—';
}

function formatSleepDuration(record: SleepRecord): string {
  if (!record.sleep_end) return '进行中';
  const start = safeTime(record.sleep_start);
  const end = safeTime(record.sleep_end);
  if (start === 0 || end <= start) return '—';

  const minutes = Math.round((end - start) / 60000);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours <= 0) return `${restMinutes}分钟`;
  return restMinutes > 0 ? `${hours}小时${restMinutes}分` : `${hours}小时`;
}

function FeedingSection({
  data,
  records,
}: {
  data: FeedingStatsData;
  records: FeedingRecord[];
}) {
  return (
    <View style={styles.sectionStack}>
      <FeedingStats data={data} />
      <FeedingHistoryTable records={records} />
    </View>
  );
}

function FeedingHistoryTable({ records }: { records: FeedingRecord[] }) {
  const rows = useMemo(
    () => sortByTimeDesc(records, (record) => record.feed_time),
    [records],
  );

  return (
    <StatsCard title="喂养历史">
      {rows.length === 0 ? (
        <Text style={styles.emptyTableText}>暂无喂养记录</Text>
      ) : (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.tableHeaderCell, styles.timeColumn]}>时间</Text>
            <Text style={[styles.tableHeaderCell, styles.typeColumn]}>类型</Text>
            <Text style={[styles.tableHeaderCell, styles.metricColumn]}>数据</Text>
            <Text style={[styles.tableHeaderCell, styles.notesColumn]}>备注</Text>
          </View>
          {rows.map((record, index) => (
            <View
              key={record.id}
              style={[
                styles.tableRow,
                index === rows.length - 1 && styles.tableRowLast,
              ]}
            >
              <Text style={[styles.tableCell, styles.timeColumn]} numberOfLines={1}>
                {formatDateTime(record.feed_time)}
              </Text>
              <Text
                style={[styles.tableCell, styles.typeColumn, styles.tableCellStrong]}
                numberOfLines={1}
              >
                {FEEDING_TYPE_LABEL[record.feed_type]}
              </Text>
              <Text style={[styles.tableCell, styles.metricColumn]} numberOfLines={1}>
                {formatFeedingMetric(record)}
              </Text>
              <Text style={[styles.tableCell, styles.notesColumn]} numberOfLines={2}>
                {record.notes || '—'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </StatsCard>
  );
}

function SleepSection({
  data,
  records,
}: {
  data: SleepStatsData;
  records: SleepRecord[];
}) {
  return (
    <View style={styles.sectionStack}>
      <SleepStats data={data} />
      <SleepHistoryTable records={records} />
    </View>
  );
}

function SleepHistoryTable({ records }: { records: SleepRecord[] }) {
  const rows = useMemo(
    () => sortByTimeDesc(records, (record) => record.sleep_start),
    [records],
  );

  return (
    <StatsCard title="睡眠历史">
      {rows.length === 0 ? (
        <Text style={styles.emptyTableText}>暂无睡眠记录</Text>
      ) : (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.tableHeaderCell, styles.timeColumn]}>时间</Text>
            <Text style={[styles.tableHeaderCell, styles.typeColumn]}>类型</Text>
            <Text style={[styles.tableHeaderCell, styles.metricColumn]}>数据</Text>
            <Text style={[styles.tableHeaderCell, styles.notesColumn]}>备注</Text>
          </View>
          {rows.map((record, index) => (
            <View
              key={record.id}
              style={[
                styles.tableRow,
                index === rows.length - 1 && styles.tableRowLast,
              ]}
            >
              <Text style={[styles.tableCell, styles.timeColumn]} numberOfLines={1}>
                {formatDateTime(record.sleep_start)}
              </Text>
              <Text
                style={[styles.tableCell, styles.typeColumn, styles.tableCellStrong]}
                numberOfLines={1}
              >
                {SLEEP_TYPE_LABEL[record.sleep_type]}
              </Text>
              <Text style={[styles.tableCell, styles.metricColumn]} numberOfLines={2}>
                {formatSleepDuration(record)}
                {'\n'}
                夜醒 {record.night_wakings} 次
              </Text>
              <Text style={[styles.tableCell, styles.notesColumn]} numberOfLines={2}>
                {record.notes || '—'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </StatsCard>
  );
}

/**
 * 成长 Dashboard — mirrors the web Dashboard
 * (`frontend/src/app/(main)/dashboard/page.tsx`) section ordering:
 *
 *   1. 摘要                — 今日摘要 + 最近记录 + 最新成长
 *   2. 喂养                — 日均统计 + bar + 历史表格
 *   3. 大小便              — 统计 + 历史
 *   4. 睡眠                — 日均统计 + bar + 历史表格
 *   5. 健康                — 健康事件 timeline
 *
 * Data is fetched in parallel via `useQueries` so each section renders as its
 * cache resolves; no full-screen spinner once any cache exists.
 *
 * PORT DECISION: mobile uses an in-house View-based composed chart instead
 * of Web-only Recharts, keeping the same data shape without a new dependency.
 */
export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [selectedSection, setSelectedSection] = useState<DashboardSection>('摘要');
  const openDrawer = useCallback(
    () => navigation.dispatch(DrawerActions.openDrawer()),
    [navigation],
  );
  const results = useQueries({
    queries: [
      dashboardQueries.summary(),
      dashboardQueries.feedingStats(STATS_HISTORY_DAYS),
      dashboardQueries.sleepStats(STATS_HISTORY_DAYS),
      dashboardQueries.diaperStats(STATS_HISTORY_DAYS),
      dashboardQueries.health(),
      growthQueries.records(),
      trackerQueries.feeding(),
      trackerQueries.sleep(),
      trackerQueries.diaper(),
    ],
  });
  const [
    summaryResult,
    feedingStatsResult,
    sleepStatsResult,
    diaperStatsResult,
    healthResult,
    growthRecordsResult,
    feedingRecordsResult,
    sleepRecordsResult,
    diaperRecordsResult,
  ] = results;

  const isFetching = results.some((r) => r.isFetching);
  const isInitialLoading = results.every((r) => r.isPending && r.data === undefined);
  const refetchAll = () => {
    results.forEach((r) => r.refetch());
  };

  const recentRecords = useMemo(() => {
    if (
      !growthRecordsResult.data ||
      !feedingRecordsResult.data ||
      !sleepRecordsResult.data
    ) {
      return [];
    }
    return buildRecentRecords(
      growthRecordsResult.data,
      feedingRecordsResult.data,
      sleepRecordsResult.data,
      healthResult.data ?? [],
      diaperRecordsResult.data ?? [],
    );
  }, [
    growthRecordsResult.data,
    feedingRecordsResult.data,
    sleepRecordsResult.data,
    healthResult.data,
    diaperRecordsResult.data,
  ]);

  if (isInitialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors['fawn-amber']} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TopBar title="" onMenu={openDrawer} />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + spacing['6'] },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetchAll}
            tintColor={colors['fawn-amber']}
          />
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sectionSelector}
        >
          {DASHBOARD_SECTIONS.map((section) => {
            const selected = selectedSection === section;
            return (
              <Pressable
                key={section}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setSelectedSection(section)}
                style={({ pressed }) => [
                  styles.sectionTab,
                  selected && styles.sectionTabActive,
                  pressed && styles.sectionTabPressed,
                ]}
              >
                <Text
                  style={[
                    styles.sectionTabLabel,
                    selected && styles.sectionTabLabelActive,
                  ]}
                >
                  {section}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {selectedSection === '摘要' ? (
          <View style={styles.sectionStack}>
            {summaryResult.data ? (
              <DashboardOverview
                summary={summaryResult.data}
                latestRecord={recentRecords[0]}
              />
            ) : (
              <View style={styles.skeleton} />
            )}
            <RecentRecords records={recentRecords} />
            <LatestGrowthCards latest={summaryResult.data?.latest_growth ?? null} />
          </View>
        ) : null}

        {selectedSection === '喂养' ? (
          feedingStatsResult.data && feedingRecordsResult.data ? (
            <FeedingSection
              data={feedingStatsResult.data}
              records={feedingRecordsResult.data}
            />
          ) : (
            <View style={styles.skeletonTall} />
          )
        ) : null}

        {selectedSection === '大小便' ? (
          diaperStatsResult.data && diaperRecordsResult.data ? (
            <DiaperStats
              data={diaperStatsResult.data}
              records={diaperRecordsResult.data}
            />
          ) : (
            <View style={styles.skeletonTall} />
          )
        ) : null}

        {selectedSection === '睡眠' ? (
          sleepStatsResult.data && sleepRecordsResult.data ? (
            <SleepSection data={sleepStatsResult.data} records={sleepRecordsResult.data} />
          ) : (
            <View style={styles.skeletonTall} />
          )
        ) : null}

        {selectedSection === '健康' ? (
          healthResult.data ? (
            <HealthTimeline records={healthResult.data} />
          ) : (
            <View style={styles.skeletonTall} />
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  container: {
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['4'],
    gap: spacing['4'],
  },
  sectionStack: {
    gap: spacing['4'],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-cream'],
  },
  sectionSelector: {
    gap: spacing['2'],
    paddingVertical: spacing['1'],
  },
  sectionTab: {
    minHeight: 40,
    paddingHorizontal: spacing['4'],
    borderRadius: radii.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTabActive: {
    backgroundColor: colors['fawn-amber'],
    borderColor: colors['fawn-amber'],
  },
  sectionTabPressed: {
    opacity: 0.85,
  },
  sectionTabLabel: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    fontWeight: '600',
  },
  sectionTabLabelActive: {
    color: colors.white,
  },
  skeleton: {
    height: 140,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    opacity: 0.5,
  },
  skeletonTall: {
    height: 200,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    opacity: 0.5,
  },
  table: {
    marginTop: spacing['3'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  tableRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    paddingHorizontal: spacing['2'],
    paddingVertical: spacing['2'],
    borderBottomWidth: 1,
    borderBottomColor: colors['oat-border'],
  },
  tableHeaderRow: {
    minHeight: 36,
    backgroundColor: colors['warm-gray'],
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableHeaderCell: {
    ...typography.metaXs,
    color: colors['dark-gray'],
  },
  tableCell: {
    ...typography.caption,
    color: colors['soft-charcoal'],
  },
  tableCellStrong: {
    fontWeight: '600',
  },
  timeColumn: {
    flex: 1.25,
    minWidth: 0,
  },
  typeColumn: {
    flex: 0.72,
    minWidth: 0,
  },
  metricColumn: {
    flex: 1,
    minWidth: 0,
  },
  notesColumn: {
    flex: 1.05,
    minWidth: 0,
  },
  emptyTableText: {
    ...typography.bodySmall,
    color: colors['mid-gray'],
    textAlign: 'center',
    paddingVertical: spacing['4'],
  },
});
