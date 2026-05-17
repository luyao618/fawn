import { useQueries } from '@tanstack/react-query';
import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TopBar } from '../components/layout/TopBar';
import { BabyInfoCard } from '../components/dashboard/BabyInfoCard';
import { FeedingStats } from '../components/dashboard/FeedingStats';
import { GrowthChart } from '../components/dashboard/GrowthChart';
import { HealthTimeline } from '../components/dashboard/HealthTimeline';
import { LatestGrowthCards } from '../components/dashboard/LatestGrowthCards';
import { SleepStats } from '../components/dashboard/SleepStats';
import {
  babyQueries,
  dashboardQueries,
  growthQueries,
} from '../shared/api';
import { colors, layout, spacing, typography } from '../shared/theme';

/**
 * 成长 Dashboard — single screen that replaces the old `HomeScreen`,
 * `GrowthScreen`, and `BabyScreen` trio. Mirrors the Web Dashboard
 * (`frontend/src/app/(main)/dashboard/page.tsx`) section ordering:
 *
 *   1. BabyInfoCard      — name + age
 *   2. LatestGrowthCards — newest weight/height/head pill
 *   3. GrowthChart       — WHO percentile reference + actual line
 *   4. FeedingStats      — daily formula bars + averages
 *   5. SleepStats        — daily sleep hours + averages
 *   6. HealthTimeline    — health record list
 *
 * Data is fetched in parallel via `useQueries` so the screen renders any
 * sections that resolve while others are still in flight (no full-screen
 * spinner once any cache exists).
 */
export function DashboardScreen() {
  const results = useQueries({
    queries: [
      babyQueries.detail(),
      dashboardQueries.summary(),
      growthQueries.chart(),
      dashboardQueries.feedingStats(30),
      dashboardQueries.sleepStats(30),
      dashboardQueries.health(),
    ],
  });
  const [
    babyResult,
    summaryResult,
    chartResult,
    feedingResult,
    sleepResult,
    healthResult,
  ] = results;

  const isFetching = results.some((r) => r.isFetching);
  const isInitialLoading = results.every((r) => r.isPending && r.data === undefined);
  const anyError = results.find((r) => r.isError);

  const refetchAll = () => {
    results.forEach((r) => r.refetch());
  };

  if (isInitialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors['fawn-amber']} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TopBar title="成长" />
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
        {anyError ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              离线 / 拉取失败，显示的是缓存数据。
              {'\n'}
              {(anyError.error as Error)?.message ?? ''}
            </Text>
          </View>
        ) : null}

        {summaryResult.data ? (
          <BabyInfoCard summary={summaryResult.data} />
        ) : (
          <View style={styles.skeleton} />
        )}

        <LatestGrowthCards latest={summaryResult.data?.latest_growth ?? null} />

        {chartResult.data ? (
          <GrowthChart
            data={chartResult.data}
            birthDate={babyResult.data?.birth_date ?? null}
          />
        ) : (
          <View style={styles.skeletonTall} />
        )}

        {feedingResult.data ? (
          <FeedingStats data={feedingResult.data} />
        ) : (
          <View style={styles.skeletonTall} />
        )}

        {sleepResult.data ? (
          <SleepStats data={sleepResult.data} />
        ) : (
          <View style={styles.skeletonTall} />
        )}

        {healthResult.data ? (
          <HealthTimeline records={healthResult.data} />
        ) : (
          <View style={styles.skeletonTall} />
        )}
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
    borderRadius: 12,
    padding: spacing['3'],
  },
  bannerText: {
    ...typography.bodySmall,
    color: colors['soft-charcoal'],
  },
  skeleton: {
    height: 96,
    backgroundColor: colors.card,
    borderRadius: 28,
    opacity: 0.5,
  },
  skeletonTall: {
    height: 220,
    backgroundColor: colors.card,
    borderRadius: 28,
    opacity: 0.5,
  },
});
