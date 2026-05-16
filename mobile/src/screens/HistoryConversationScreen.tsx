import { useQuery } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
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
  resolveChatImageUrl,
  type ChatMessage,
} from '../shared/api';
import { getApiBaseUrl } from '../lib/api';
import { getToken } from '../lib/tokenStorage';

interface Props {
  conversationId: string;
  onBack: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Read-only view of a historical conversation. Reuses the same
 * `chat.conversation(id)` query as the live chat screen, so opening a
 * conversation here hits the persisted cache instantly and updates in the
 * background when online. No input bar, no send / upload UI.
 */
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c7a4b" />
      </View>
    );
  }

  const headerTitle =
    data?.conversation.summary?.trim() ||
    (data?.conversation.started_at ? formatDate(data.conversation.started_at) : '历史会话');

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.backText}>← 历史</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <Text style={styles.headerMeta}>只读</Text>
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
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>这个会话还没有消息。</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fafafa',
  },
  backButton: { paddingVertical: 4 },
  backText: { color: '#2c7a4b', fontSize: 14 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#222', marginTop: 4 },
  headerMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  banner: {
    margin: 16,
    backgroundColor: '#fff4e0',
    borderColor: '#e0a96d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  bannerText: { color: '#8a5a17', fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  empty: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 32 },
  bubbleRow: { flexDirection: 'row', marginVertical: 4 },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  bubbleUser: { backgroundColor: '#2c7a4b' },
  bubbleAssistant: { backgroundColor: '#f1f3f2' },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAssistant: { color: '#222' },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 6,
  },
});
