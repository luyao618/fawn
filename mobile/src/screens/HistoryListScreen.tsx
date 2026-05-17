// History list — mobile counterpart of `frontend/src/app/(main)/history/page.tsx`.
//
// Visual language strictly comes from `mobile/src/shared/theme.ts`. Business
// logic (infinite query backed by `chatQueries.history`) is unchanged.

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
import { TopBar } from '../components/layout/TopBar';
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';

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
      <View style={styles.root}>
        <TopBar title="历史" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors['fawn-amber']} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TopBar title="历史" />
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
            tintColor={colors['fawn-amber']}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        ListHeaderComponent={
          <Text style={styles.subtitle}>过往会话 · 只读</Text>
        }
        ListEmptyComponent={<Text style={styles.empty}>还没有历史会话。</Text>}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors['fawn-amber']} />
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
            activeOpacity={0.85}
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
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors['warm-cream'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  subtitle: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    marginBottom: spacing['3'],
  },
  banner: {
    marginHorizontal: spacing['4'],
    marginTop: spacing['3'],
    backgroundColor: colors['warning-amber-light'],
    borderColor: colors['warning-amber'],
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing['3'],
  },
  bannerText: {
    ...typography.bodySmall,
    color: colors['warning-amber'],
  },
  listContent: {
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['3'],
    paddingBottom: spacing['8'],
  },
  empty: {
    ...typography.body,
    color: colors['dark-gray'],
    marginTop: spacing['6'],
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing['3'],
    paddingHorizontal: spacing['4'],
    backgroundColor: colors['card'],
    borderRadius: radii.lg,
    ...shadows.card,
  },
  separator: {
    height: spacing['2'],
  },
  rowMain: { flex: 1, paddingRight: spacing['3'] },
  rowTitle: {
    ...typography.body,
    color: colors['soft-charcoal'],
    fontFamily: typography.heading.fontFamily,
  },
  rowMeta: {
    ...typography.caption,
    color: colors['mid-gray'],
    marginTop: spacing['1'],
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors['sage-green-soft'],
  },
  footer: { paddingVertical: spacing['4'], alignItems: 'center' },
  footerEnd: {
    paddingVertical: spacing['4'],
    textAlign: 'center',
    color: colors['mid-gray'],
    ...typography.caption,
  },
});
