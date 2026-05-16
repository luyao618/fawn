import { useInfiniteQuery } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { chatQueries, type ConversationSummary } from '../shared/api';

const PAGE_SIZE = 20;

interface Props {
  onOpenConversation: (id: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function summaryFor(c: ConversationSummary): string {
  if (c.summary && c.summary.trim().length > 0) return c.summary;
  return c.is_active ? '当前会话' : '历史会话';
}

export function HistoryListScreen({ onOpenConversation }: Props) {
  const {
    data,
    isPending,
    isFetching,
    isFetchingNextPage,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery(chatQueries.history(PAGE_SIZE));

  const items = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap((p) => p.items);
  }, [data]);

  if (isPending && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c7a4b" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>历史</Text>
        <Text style={styles.subtitle}>过往会话 · 只读</Text>
      </View>

      {isError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            离线 / 拉取失败，显示的是缓存数据。{'\n'}
            {(error as Error)?.message ?? ''}
          </Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isFetchingNextPage}
            onRefresh={() => refetch()}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>还没有历史会话。</Text>
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color="#2c7a4b" />
            </View>
          ) : !hasNextPage && items.length > 0 ? (
            <Text style={styles.footerEnd}>已到底部</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => onOpenConversation(item.id)}
            accessibilityRole="button"
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {summaryFor(item)}
              </Text>
              <Text style={styles.rowMeta}>
                {item.message_count} 条 · {formatDate(item.started_at)}
              </Text>
            </View>
            {item.is_active && <View style={styles.activeDot} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#222' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 4 },
  banner: {
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: '#fff4e0',
    borderColor: '#e0a96d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  bannerText: { color: '#8a5a17', fontSize: 13 },
  listContent: { paddingHorizontal: 24, paddingBottom: 24 },
  empty: { fontSize: 14, color: '#666', marginTop: 24, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowMain: { flex: 1, paddingRight: 12 },
  rowTitle: { fontSize: 15, color: '#222', fontWeight: '500' },
  rowMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2c7a4b',
  },
  footer: { paddingVertical: 16, alignItems: 'center' },
  footerEnd: { paddingVertical: 16, textAlign: 'center', color: '#aaa', fontSize: 12 },
});
