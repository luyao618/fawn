import { useQueries } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DashboardOverview } from '../components/dashboard/DashboardOverview';
import { FeedingStats } from '../components/dashboard/FeedingStats';
import { HealthTimeline } from '../components/dashboard/HealthTimeline';
import { LatestGrowthCards } from '../components/dashboard/LatestGrowthCards';
import { SleepStats } from '../components/dashboard/SleepStats';
import {
  RecentRecords,
  buildRecentRecords,
} from '../components/dashboard/RecentRecords';
import {
  dashboardQueries,
  growthQueries,
  trackerQueries,
} from '../shared/api';
import { colors, layout, radii, spacing, typography } from '../shared/theme';

const STATS_HISTORY_DAYS = 90;

/**
 * 成长 Dashboard — mirrors the web Dashboard
 * (`frontend/src/app/(main)/dashboard/page.tsx`) section ordering:
 *
 *   1. Error banner (optional)
 *   2. DashboardOverview    — avatar + 今日摘要 + StatChips
 *   3. LatestGrowthCards    — 体重 / 身高 / 头围 inline pill
 *   4. FeedingStats         — 日均统计 + bar (PORT DECISION: no chart lib)
 *   5. SleepStats           — 日均统计 + bar (PORT DECISION: no chart lib)
 *   6. HealthTimeline       — 健康事件 timeline
 *   7. RecentRecords        — 最近 5 条混合记录
 *
 * Data is fetched in parallel via `useQueries` so each section renders as its
 * cache resolves; no full-screen spinner once any cache exists.
 *
 * PORT DECISION: brush range and recharts line/bar charts deferred — mobile
 * has no chart lib in `package.json` and adding one is out of scope.
 * `FeedingStats`/`SleepStats` use the in-house `MiniBarChart` with stat
 * triads/duads above.
 */
export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const results = useQueries({
    queries: [
      dashboardQueries.summary(),
      dashboardQueries.feedingStats(STATS_HISTORY_DAYS),
      dashboardQueries.sleepStats(STATS_HISTORY_DAYS),
      dashboardQueries.health(),
      growthQueries.records(),
      trackerQueries.feeding(),
      trackerQueries.sleep(),
    ],
  });
  const [
    summaryResult,
    feedingStatsResult,
    sleepStatsResult,
    healthResult,
    growthRecordsResult,
    feedingRecordsResult,
    sleepRecordsResult,
  ] = results;

  const isFetching = results.some((r) => r.isFetching);
  const isInitialLoading = results.every((r) => r.isPending && r.data === undefined);
  const failedCount = results.filter((r) => r.isError).length;
  const loadError =
    failedCount > 0 ? `有 ${failedCount} 项数据暂时没更新，已保留可用内容。` : null;

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
    );
  }, [
    growthRecordsResult.data,
    feedingRecordsResult.data,
    sleepRecordsResult.data,
    healthResult.data,
  ]);

  if (isInitialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors['fawn-amber']} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetchAll}
            tintColor={colors['fawn-amber']}
          />
        }
      >
        {loadError ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{loadError}</Text>
          </View>
        ) : null}

        {summaryResult.data ? (
          <DashboardOverview
            summary={summaryResult.data}
            latestRecord={recentRecords[0]}
          />
        ) : (
          <View style={styles.skeleton} />
        )}

        <LatestGrowthCards latest={summaryResult.data?.latest_growth ?? null} />

        {feedingStatsResult.data ? (
          <FeedingStats data={feedingStatsResult.data} />
        ) : (
          <View style={styles.skeletonTall} />
        )}

        {sleepStatsResult.data ? (
          <SleepStats data={sleepStatsResult.data} />
        ) : (
          <View style={styles.skeletonTall} />
        )}

        {healthResult.data ? (
          <HealthTimeline records={healthResult.data} />
        ) : (
          <View style={styles.skeletonTall} />
        )}

        <RecentRecords records={recentRecords} />
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
    paddingBottom: layout.tabbarHeight + spacing['4'],
    gap: spacing['4'],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-cream'],
  },
  banner: {
    backgroundColor: colors['warning-amber-light'],
    borderColor: colors['warning-amber'],
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing['3'],
  },
  bannerText: {
    ...typography.bodySmall,
    color: colors['soft-charcoal'],
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
});
