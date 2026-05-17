import { useQuery } from '@tanstack/react-query';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  chatQueries,
  createConversation,
  type ConversationSummary,
} from '../shared/api';
import {
  colors,
  fontFamily,
  iconButtonRadius,
  layout,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';
import { TopBar } from '../components/layout/TopBar';

/**
 * Conversation list — entry point of the 管家 (chat) tab. Each row is a
 * cream card with the summary + meta. The "新会话" action sits in the TopBar
 * right slot so it stays consistent with other module headers.
 *
 * Visual tokens only — never inline hex / radii / shadows.
 */

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
        <ActivityIndicator size="large" color={colors['fawn-amber']} />
      </View>
    );
  }

  return (
    <View style={styles.canvas}>
      <TopBar
        title="管家"
        rightAction={
          <Pressable
            onPress={handleNewConversation}
            disabled={creating}
            accessibilityRole="button"
            accessibilityLabel="新会话"
            style={[styles.newButton, creating && styles.buttonDisabled]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors['on-brand']} />
            ) : (
              <Ionicons name="add" size={22} color={colors['on-brand']} />
            )}
          </Pressable>
        }
      />

      {isError ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            离线 / 拉取失败，显示的是缓存数据。{'\n'}
            {(error as Error)?.message ?? ''}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => refetch()}
            tintColor={colors['fawn-amber']}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>还没有会话，点击右上角开始聊天。</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpenConversation(item.id)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {summaryFor(item)}
              </Text>
              <Text style={styles.rowMeta}>
                {item.message_count} 条 · {formatDate(item.started_at)}
              </Text>
            </View>
            {item.is_active ? <View style={styles.activeDot} /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors['warm-cream'] },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-cream'],
  },
  newButton: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: iconButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['fawn-amber'],
    ...shadows.card,
  },
  buttonDisabled: { opacity: 0.6 },
  banner: {
    marginHorizontal: spacing['4'],
    marginTop: spacing['3'],
    backgroundColor: colors['warning-amber-light'],
    borderWidth: 1,
    borderColor: colors['warning-amber'],
    borderRadius: radii.lg,
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
    gap: spacing['2'],
  },
  empty: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    textAlign: 'center',
    marginTop: spacing['8'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing['3'],
    paddingHorizontal: spacing['4'],
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors['oat-border'],
    ...shadows.card,
  },
  rowPressed: {
    backgroundColor: colors['warm-gray'],
  },
  rowMain: { flex: 1, paddingRight: spacing['3'] },
  rowTitle: {
    ...typography.body,
    fontFamily: fontFamily.sansSemibold,
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
    backgroundColor: colors['sage-green'],
  },
});
