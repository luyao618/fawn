import { useQuery } from '@tanstack/react-query';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  chatQueries,
  createConversation,
  type ConversationSummary,
} from '../shared/api';

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

export function ConversationListScreen({ onOpenConversation }: Props) {
  const { data, isPending, isFetching, isError, error, refetch } = useQuery(
    chatQueries.conversations(),
  );
  const [creating, setCreating] = React.useState(false);

  const handleNewConversation = async () => {
    setCreating(true);
    try {
      const conv = await createConversation();
      await refetch();
      onOpenConversation(conv.id);
    } finally {
      setCreating(false);
    }
  };

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
        <Text style={styles.title}>聊天</Text>
        <TouchableOpacity
          style={[styles.newButton, creating && styles.buttonDisabled]}
          onPress={handleNewConversation}
          disabled={creating}
          accessibilityRole="button"
        >
          <Text style={styles.newButtonText}>{creating ? '创建中…' : '新会话'}</Text>
        </TouchableOpacity>
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
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>还没有会话，点击"新会话"开始聊天。</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#222' },
  newButton: {
    backgroundColor: '#2c7a4b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  newButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
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
});
