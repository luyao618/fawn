import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  chatImageUrl,
  chatQueries,
  createConversation,
  resolveChatImageUrl,
  sendChatMessage,
  uploadChatImage,
  type ChatMessage,
} from '../shared/api';
import { useAuth } from '../auth/AuthContext';
import { getApiBaseUrl } from '../lib/api';
import { getToken } from '../lib/tokenStorage';
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from '../shared/theme';
import { TopBar } from '../components/layout/TopBar';
import { ChatInput } from '../components/chat/ChatInput';
import { MessageBubble } from '../components/chat/MessageBubble';
import { TimeSeparator } from '../components/chat/TimeSeparator';

/**
 * Conversation (聊天) screen — visual parity with Web `app/(main)/chat/page.tsx`.
 *
 * All visuals come from `shared/theme.ts` (colors / radii / shadows / type).
 * Bubble visuals, markdown rendering, safety-alert styling and the rounded
 * composer pill live in `src/components/chat/*` so this screen is mostly
 * orchestration.
 */

interface Props {
  conversationId?: string;
  onBack?: () => void;
  hideHeader?: boolean;
}

interface PendingImage {
  imageUrl: string; // server-returned ref (e.g. /api/chat/.../images/xxx.jpg)
  localUri: string; // local file uri for instant preview
}

function senderMeta(user: { display_name?: string | null; role?: string | null } | null) {
  return {
    name: user?.display_name ?? '家庭成员',
    role: user?.role ?? '',
  };
}

export function ConversationScreen({ conversationId, onBack, hideHeader }: Props) {
  const queryClient = useQueryClient();
  const baseUrl = getApiBaseUrl();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // When no id is provided (tab root entry), pick the active conversation or
  // fall back to the most recent one. If the user has no conversations yet,
  // show an empty CTA that creates one on demand.
  const conversationsQuery = useQuery({
    ...chatQueries.conversations(),
    enabled: !conversationId,
  });
  const resolvedId = useMemo(() => {
    if (conversationId) return conversationId;
    const list = conversationsQuery.data ?? [];
    if (list.length === 0) return undefined;
    return (list.find((c) => c.is_active) ?? list[0]).id;
  }, [conversationId, conversationsQuery.data]);

  const [creating, setCreating] = useState(false);

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    ...chatQueries.conversation(resolvedId ?? ''),
    enabled: Boolean(resolvedId),
  });

  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  // Optimistic user message rendered immediately on send so the UI feels
  // instant. Cleared after we invalidate the conversation query and the
  // canonical row arrives.
  const [optimisticUser, setOptimisticUser] = useState<{
    content: string;
    imageUrl: string | null;
  } | null>(null);
  // Local streaming state for the assistant reply — we accumulate SSE tokens
  // into `content` and render it as a synthetic trailing message. Setting back
  // to `null` removes the placeholder (either after `done` + refetch, or on
  // error to roll back).
  const [streamingAssistant, setStreamingAssistant] = useState<{
    content: string;
  } | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  // 80 cps typewriter effect — faster pacing
  const pendingBuffer = useRef<string>('');
  const typingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTypingTimer = useCallback(() => {
    if (typingTimer.current !== null) {
      clearInterval(typingTimer.current);
      typingTimer.current = null;
    }
  }, []);

  const flushBuffer = useCallback(() => {
    stopTypingTimer();
    if (pendingBuffer.current.length > 0) {
      const remaining = pendingBuffer.current;
      pendingBuffer.current = '';
      setStreamingAssistant((prev) =>
        prev ? { content: prev.content + remaining } : { content: remaining },
      );
    }
  }, [stopTypingTimer]);

  const startTypingTimer = useCallback(() => {
    if (typingTimer.current !== null) return;
    typingTimer.current = setInterval(() => {
      if (pendingBuffer.current.length === 0) {
        stopTypingTimer();
        return;
      }
      const char = pendingBuffer.current.slice(0, 1);
      pendingBuffer.current = pendingBuffer.current.slice(1);
      setStreamingAssistant((prev) =>
        prev ? { content: prev.content + char } : { content: char },
      );
    }, 12); // ~80 chars/sec
  }, [stopTypingTimer]);

  const baseMessages = data?.messages ?? [];
  // Synthesize the optimistic user + streaming assistant rows at the tail of
  // the list. Using a stable, prefixed id keeps FlatList's keyExtractor happy
  // and avoids collisions with real server ids (UUIDs).
  const messages = useMemo<ChatMessage[]>(() => {
    if (!resolvedId) return baseMessages;
    const extras: ChatMessage[] = [];
    if (optimisticUser) {
      extras.push({
        id: 'temp-user',
        conversation_id: resolvedId,
        sender_user_id: user?.id ?? null,
        role: 'user',
        content: optimisticUser.content,
        message_type: optimisticUser.imageUrl ? 'image' : 'text',
        metadata: optimisticUser.imageUrl ? { image_url: optimisticUser.imageUrl } : null,
        created_at: new Date().toISOString(),
      });
    }
    if (streamingAssistant) {
      extras.push({
        id: 'temp-assistant',
        conversation_id: resolvedId,
        sender_user_id: null,
        role: 'assistant',
        content: streamingAssistant.content,
        message_type: 'text',
        metadata: null,
        created_at: new Date().toISOString(),
      });
    }
    return extras.length > 0 ? [...baseMessages, ...extras] : baseMessages;
  }, [baseMessages, optimisticUser, streamingAssistant, resolvedId, user?.id]);

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

  // Clear typewriter timer on unmount to avoid setState on an unmounted component.
  useEffect(() => {
    return () => {
      stopTypingTimer();
    };
  }, [stopTypingTimer]);

  const imageHeaders = useMemo(
    () => (authToken ? { Authorization: `Bearer ${authToken}` } : undefined),
    [authToken],
  );

  // Track whether the list is pinned near the bottom. When the user scrolls
  // up to read history we MUST NOT yank them back on every typewriter tick.
  const isNearBottomRef = useRef(true);
  const handleScroll = (e: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceFromBottom < 80; // px
  };

  useEffect(() => {
    if (messages.length === 0) return;
    if (!isNearBottomRef.current) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const handlePickImage = async () => {
    if (!resolvedId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('需要相册权限', '请在系统设置中授予相册访问权限');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const filename = asset.fileName ?? `upload-${Date.now()}.jpg`;
      const res = await uploadChatImage(resolvedId, asset.uri, mimeType, filename);
      setPendingImage({ imageUrl: res.image_url, localUri: asset.uri });
    } catch (err) {
      Alert.alert('上传失败', (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    if (!resolvedId) return;
    const content = text.trim();
    if (!content && !pendingImage) return;
    const sentContent = content || (pendingImage ? '[图片]' : '');
    const sentImageUrl = pendingImage?.imageUrl ?? null;
    // Clear composer + show optimistic rows synchronously so the keyboard
    // dismiss and bubbles land in the same frame.
    setText('');
    setPendingImage(null);
    setOptimisticUser({ content: sentContent, imageUrl: sentImageUrl });
    setStreamingAssistant({ content: '' });
    setSending(true);
    try {
      const token = authToken ?? (await getToken());
      await sendChatMessage(
        resolvedId,
        sentContent,
        sentImageUrl,
        baseUrl,
        token,
        {
          onToken: (chunk) => {
            pendingBuffer.current += chunk;
            startTypingTimer();
          },
          onDone: () => {
            // Flush remaining buffer before invalidating queries so the user
            // never sees text jump from mid-typewriter to the full response.
            flushBuffer();
          },
        },
      );
      await queryClient.invalidateQueries({
        queryKey: chatQueries.conversation(resolvedId).queryKey,
      });
      await queryClient.invalidateQueries({
        queryKey: chatQueries.conversations().queryKey,
      });
      setOptimisticUser(null);
      setStreamingAssistant(null);
    } catch (err) {
      // Roll back optimistic UI so the user can retry without ghost rows.
      stopTypingTimer();
      pendingBuffer.current = '';
      setOptimisticUser(null);
      setStreamingAssistant(null);
      Alert.alert('发送失败', (err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const meta = senderMeta(user);

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const ref = item.metadata?.image_url;
    const uri = ref ? resolveChatImageUrl(baseUrl, ref) : null;
    const isOwnMessage =
      item.role === 'user' && (!item.sender_user_id || item.sender_user_id === user?.id);
    // Insert a TimeSeparator before the first message and whenever the date
    // changes between consecutive messages.
    const prevItem = index > 0 ? messages[index - 1] : null;
    const showSeparator =
      !prevItem ||
      new Date(item.created_at).toDateString() !== new Date(prevItem.created_at).toDateString();
    return (
      <>
        {showSeparator && <TimeSeparator timestamp={item.created_at} />}
        <MessageBubble
          message={item}
          imageUri={uri}
          imageHeaders={uri ? imageHeaders : undefined}
          senderName={isOwnMessage ? meta.name : undefined}
          senderRole={isOwnMessage ? meta.role : undefined}
          isStreaming={item.id === 'temp-assistant'}
        />
      </>
    );
  };

  if (!conversationId && conversationsQuery.isPending && !conversationsQuery.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors['fawn-amber']} />
      </View>
    );
  }

  if (!resolvedId) {
    // No conversations yet — offer a one-tap CTA to create one.
    const handleCreate = async () => {
      setCreating(true);
      try {
        await createConversation();
        await queryClient.invalidateQueries({
          queryKey: chatQueries.conversations().queryKey,
        });
      } catch (err) {
        Alert.alert('新建会话失败', (err as Error).message);
      } finally {
        setCreating(false);
      }
    };
    return (
      <View style={styles.canvas}>
        {hideHeader ? null : <TopBar title="管家" onBack={onBack} />}
        <View style={styles.center}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>还没有任何会话</Text>
            <Text style={styles.emptyBody}>新建一个会话开始与管家对话。</Text>
            <Text
              accessibilityRole="button"
              onPress={creating ? undefined : handleCreate}
              style={styles.emptyCta}
            >
              {creating ? '创建中…' : '新建会话'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (isPending && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors['fawn-amber']} />
      </View>
    );
  }

  return (
    <View style={styles.canvas}>
      {hideHeader ? null : (
        <TopBar
          title={data?.conversation.summary ?? '管家'}
          onBack={onBack}
        />
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        {isError ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              离线 / 拉取失败，显示的是缓存数据。{'\n'}
              {(error as Error)?.message ?? ''}
            </Text>
          </View>
        ) : null}

        {/* PORT DECISION: MessageList skipped — FlatList covers this RN-idiomatically. */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: spacing['4'] },
          ]}
          onContentSizeChange={() => {
            if (isNearBottomRef.current) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          refreshing={isFetching}
          onRefresh={() => refetch()}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>今天想先记录什么？</Text>
              <Text style={styles.emptyBody}>
                可以直接发送体重、喂养、睡眠或健康问题，我会整理成家庭可读的记录。
              </Text>
            </View>
          }
        />

        <ChatInput
          value={text}
          onChangeText={setText}
          onSend={handleSend}
          onAttachImage={handlePickImage}
          attachedImageUri={pendingImage?.localUri ?? null}
          onRemoveImage={() => setPendingImage(null)}
          sending={sending}
          uploading={uploading}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

export { chatImageUrl };

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-cream'],
  },
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
    flexGrow: 1,
  },
  emptyCard: {
    marginTop: spacing['3'],
    backgroundColor: colors['card-frosted'],
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    padding: spacing['4'],
    gap: spacing['1'],
    ...shadows.card,
  },
  emptyTitle: {
    ...typography.chatTitle,
  },
  emptyBody: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  emptyCta: {
    ...typography.body,
    color: colors['fawn-amber'],
    marginTop: spacing['3'],
    fontWeight: '600',
  },
});
