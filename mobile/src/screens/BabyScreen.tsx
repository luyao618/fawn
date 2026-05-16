import { useQuery } from '@tanstack/react-query';
import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { babyQueries, type Baby } from '../shared/api';

function formatField(value: string | number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

export function BabyScreen() {
  const { data, isPending, isFetching, isError, error, refetch, dataUpdatedAt } = useQuery<
    Baby | null
  >(babyQueries.detail());

  // Show the cached value as soon as it's available; only show the full-screen
  // spinner on the very first cold load when there is no cache to fall back on.
  if (isPending && !data) {
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
        <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
      }
    >
      <Text style={styles.title}>宝宝档案</Text>

      {isError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            离线 / 拉取失败，显示的是缓存数据。{'\n'}
            {(error as Error)?.message ?? ''}
          </Text>
        </View>
      )}

      {!data ? (
        <Text style={styles.empty}>还没有宝宝档案。</Text>
      ) : (
        <View style={styles.card}>
          <Row label="姓名" value={formatField(data.name)} />
          <Row label="性别" value={formatField(data.gender)} />
          <Row label="出生日期" value={formatField(data.birth_date)} />
          <Row label="出生体重" value={formatField(data.birth_weight_g, ' g')} />
          <Row label="出生身长" value={formatField(data.birth_height_cm, ' cm')} />
          <Row label="出生头围" value={formatField(data.birth_head_cm, ' cm')} />
          <Row label="早产" value={data.is_premature ? '是' : '否'} />
          {data.is_premature && (
            <Row label="孕周" value={formatField(data.gestational_weeks)} />
          )}
        </View>
      )}

      <Text style={styles.meta}>
        更新于 {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString() : '—'}
      </Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 64,
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
    marginBottom: 16,
    color: '#222',
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
  empty: {
    fontSize: 14,
    color: '#666',
    marginTop: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowLabel: {
    fontSize: 14,
    color: '#666',
  },
  rowValue: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500',
  },
  meta: {
    marginTop: 16,
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
});
