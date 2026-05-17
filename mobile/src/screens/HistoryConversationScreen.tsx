// Read-only view of a historical conversation. Reuses the same
// `chat.conversation(id)` query as the live chat screen, so opening a
// conversation here hits the persisted cache instantly and updates in the
// background when online. No input bar, no send / upload UI.
//
// Visual language strictly from `mobile/src/shared/theme.ts`.

import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  chatQueries,
  resolveChatImageUrl,
  type ChatMessage,
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
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function HistoryConversationScreen({ conversationId, onBack }: Props) {
  const baseUrl = getApiBaseUrl();
  const { data, isPending, isError, error, refetch, isFetching } = useQuery(
    chatQueries.conversation(conversationId),
  );

  const [authToken, setAuthToken] = useState<string | null>(null);

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

  const messages = data?.messages ?? [];

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const imgRef = item.metadata?.image_url;
    const imgUri = imgRef ? resolveChatImageUrl(baseUrl, imgRef) : null;
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRight : styles.bubbleLeft]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
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
    );
  };

  if (isPending && !data) {
    return (
      <View style={styles.root}>
        <TopBar title="历史会话" onBack={onBack} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors['fawn-amber']} />
        </View>
      </View>
    );
  }

  const headerTitle =
    data?.conversation.summary?.trim() ||
    (data?.conversation.started_at ? formatDate(data.conversation.started_at) : '历史会话');

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

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => refetch()}
            tintColor={colors['fawn-amber']}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>这个会话还没有消息。</Text>
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
  bubbleRow: { flexDirection: 'row', marginVertical: spacing['1'] },
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
  bubbleText: {
    ...typography.body,
  },
  bubbleTextUser: { color: colors['card'] },
  bubbleTextAssistant: { color: colors['soft-charcoal'] },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: radii.md,
    marginBottom: spacing['1'],
  },
});
