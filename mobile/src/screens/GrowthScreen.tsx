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

import { GrowthChart } from '../components/GrowthChart';
import { LatestGrowthCard } from '../components/LatestGrowthCard';
import { babyQueries, growthQueries } from '../shared/api';

export function GrowthScreen() {
  const results = useQueries({
    queries: [babyQueries.detail(), growthQueries.chart(), growthQueries.latest()],
  });
  const [babyResult, chartResult, latestResult] = results;

  const isFetching = results.some((r) => r.isFetching);
  const isInitialLoading =
    results.every((r) => r.isPending && r.data === undefined);
  const anyError = results.find((r) => r.isError);

  const refetchAll = () => {
    babyResult.refetch();
    chartResult.refetch();
    latestResult.refetch();
  };

  if (isInitialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c7a4b" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetchAll} />
      }
    >
      <Text style={styles.title}>成长</Text>

      {anyError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            离线 / 拉取失败，显示的是缓存数据。{'\n'}
            {(anyError.error as Error)?.message ?? ''}
          </Text>
        </View>
      )}

      <View style={styles.latestSection}>
        <LatestGrowthCard latest={latestResult.data ?? null} />
      </View>

      <View style={styles.chartSection}>
        {chartResult.data ? (
          <GrowthChart
            data={chartResult.data}
            birthDate={babyResult.data?.birth_date ?? null}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>暂无生长数据</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16,
  },
  banner: {
    backgroundColor: '#fff4e0',
    borderColor: '#e0a96d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  bannerText: {
    color: '#8a5a17',
    fontSize: 13,
  },
  latestSection: {
    marginBottom: 16,
  },
  chartSection: {
    marginBottom: 8,
  },
  empty: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
  },
});
