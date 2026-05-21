// Read-only history detail with optional target-message positioning.
//
// The list can be opened from keyword search or calendar activity. Route ids
// remain internal; the user-facing contract is "show the matched message".

import { useQuery } from '@tanstack/react-query';
import { useRoute } from '@react-navigation/native';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  api,
  resolveChatImageUrl,
  type ChatMessage,
  type ConversationDetail,
} from '../shared/api';
import { getApiBaseUrl } from '../lib/api';
import { getToken } from '../lib/tokenStorage';
import { TopBar } from '../components/layout/TopBar';
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';

interface Props {
  conversationId: string;
  onBack: () => void;
  targetMessageId?: string;
  targetDate?: string;
}

interface HistoryRouteParams {
  id?: string;
  targetMessageId?: string;
  targetDate?: string;
}

async function fetchHistoryDetail(
  id: string,
  targetMessageId?: string,
): Promise<ConversationDetail> {
  const params: Record<string, string | number> = targetMessageId
    ? { target_message_id: targetMessageId, around_limit: 25 }
    : { limit: 50 };
  const { data } = await api.get<ConversationDetail>(`/chat/conversations/${id}`, {
    params,
  });
  return data;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function HistoryConversationScreen({
  conversationId,
  onBack,
  targetMessageId,
  targetDate,
}: Props) {
  const baseUrl = getApiBaseUrl();
  const route = useRoute();
  const routeParams = (route.params ?? {}) as HistoryRouteParams;
  const effectiveConversationId = conversationId || routeParams.id || '';
  const effectiveTargetMessageId = targetMessageId ?? routeParams.targetMessageId;
  const effectiveTargetDate = targetDate ?? routeParams.targetDate;

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [contentReady, setContentReady] = useState(false);

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'chat',
      'history-detail',
      { id: effectiveConversationId, targetMessageId: effectiveTargetMessageId ?? null },
    ],
    queryFn: () => fetchHistoryDetail(effectiveConversationId, effectiveTargetMessageId),
    enabled: effectiveConversationId.length > 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getToken();
      if (!cancelled) setAuthToken(t);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const imageHeaders = useMemo(
    () => (authToken ? { Authorization: `Bearer ${authToken}` } : undefined),
    [authToken],
  );

  const conversation = data?.conversation;
  const messages = data?.messages ?? [];
  const targetIndex = useMemo(
    () => messages.findIndex((message) => message.id === effectiveTargetMessageId),
    [effectiveTargetMessageId, messages],
  );
  const targetMissing = Boolean(data && effectiveTargetMessageId && targetIndex < 0);

  useEffect(() => {
    setContentReady(false);
  }, [effectiveConversationId, effectiveTargetMessageId]);

  useEffect(() => {
    if (!contentReady || targetIndex < 0) return;
    const handle = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: targetIndex,
        animated: true,
        viewPosition: 0.45,
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [contentReady, targetIndex]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const isTarget = item.id === effectiveTargetMessageId;
    const imgRef = item.metadata?.image_url;
    const imgUri = imgRef ? resolveChatImageUrl(baseUrl, imgRef) : null;
    return (
      <View style={[styles.messageBlock, isTarget && styles.targetBlock]}>
        {isTarget ? <Text style={styles.targetLabel}>定位到这里</Text> : null}
        <View style={[styles.bubbleRow, isUser ? styles.bubbleRight : styles.bubbleLeft]}>
          <View
            style={[
              styles.bubble,
              isUser ? styles.bubbleUser : styles.bubbleAssistant,
              isTarget && styles.bubbleTarget,
            ]}
          >
            {imgUri && (
              <ExpoImage
                source={{ uri: imgUri, headers: imageHeaders }}
                style={styles.messageImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
                accessibilityLabel="聊天图片"
              />
            )}
            {item.content ? (
              <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
                {item.content}
              </Text>
            ) : null}
          </View>
        </View>
        <Text style={[styles.messageMeta, isUser ? styles.messageMetaRight : styles.messageMetaLeft]}>
          {formatDateTime(item.created_at)}
        </Text>
      </View>
    );
  };

  if (!effectiveConversationId) {
    return (
      <View style={styles.root}>
        <TopBar title="历史记录" onBack={onBack} />
        <View style={styles.center}>
          <Text style={styles.empty}>没有可打开的历史记录。</Text>
        </View>
      </View>
    );
  }

  if (isPending && !data) {
    return (
      <View style={styles.root}>
        <TopBar title="历史记录" onBack={onBack} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors['fawn-amber']} />
        </View>
      </View>
    );
  }

  const headerTitle = effectiveTargetDate
    ? formatDateLabel(effectiveTargetDate)
    : conversation?.summary?.trim() ||
      (conversation?.started_at ? formatDateTime(conversation.started_at) : '历史记录');

  return (
    <View style={styles.root}>
      <TopBar title={headerTitle} onBack={onBack} />

      {isError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            离线 / 拉取失败，显示的是缓存数据。{'\n'}
            {(error as Error)?.message ?? ''}
          </Text>
        </View>
      )}
      {targetMissing ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>目标消息暂时不在当前窗口，请下拉刷新后重试。</Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => setContentReady(true)}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index - 120),
              animated: true,
            });
          }, 100);
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => refetch()}
            tintColor={colors['fawn-amber']}
          />
        }
        ListHeaderComponent={
          effectiveTargetMessageId ? (
            <Text style={styles.targetHint}>已打开定位窗口，匹配消息会加深显示。</Text>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>这里还没有消息。</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors['warm-cream'] },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['4'],
  },
  banner: {
    margin: spacing['4'],
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
  targetHint: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
    textAlign: 'center',
    marginBottom: spacing['3'],
  },
  listContent: {
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['3'],
    paddingBottom: spacing['6'],
    flexGrow: 1,
  },
  empty: {
    ...typography.body,
    color: colors['dark-gray'],
    textAlign: 'center',
    marginTop: spacing['8'],
  },
  messageBlock: {
    marginVertical: spacing['1'],
  },
  targetBlock: {
    backgroundColor: colors['warning-amber-light'],
    borderRadius: radii.lg,
    padding: spacing['2'],
  },
  targetLabel: {
    ...typography.caption,
    color: colors['warning-amber'],
    fontFamily: typography.button.fontFamily,
    textAlign: 'center',
    marginBottom: spacing['1'],
  },
  bubbleRow: { flexDirection: 'row' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    borderRadius: radii.bubble,
    ...shadows.card,
  },
  bubbleUser: { backgroundColor: colors['bubble-user'] },
  bubbleAssistant: {
    backgroundColor: colors['bubble-agent'],
    borderWidth: 1,
    borderColor: colors['oat-border'],
  },
  bubbleTarget: {
    borderWidth: 1,
    borderColor: colors['warning-amber'],
  },
  bubbleText: {
    ...typography.body,
  },
  bubbleTextUser: { color: colors['card'] },
  bubbleTextAssistant: { color: colors['soft-charcoal'] },
  messageMeta: {
    ...typography.caption,
    color: colors['mid-gray'],
    marginTop: spacing['1'],
  },
  messageMetaLeft: {
    textAlign: 'left',
  },
  messageMetaRight: {
    textAlign: 'right',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: radii.md,
    marginBottom: spacing['1'],
  },
});
