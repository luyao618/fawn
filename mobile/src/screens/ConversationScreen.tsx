import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { DrawerActions, useNavigation } from '@react-navigation/native';

import {
  chatImageUrl,
  chatQueries,
  createConversation,
  fetchConversation,
  resolveChatImageUrl,
  sendChatMessage,
  uploadChatImage,
  type ChatMessage,
  type ConversationDetail,
} from '../shared/api';
import { dedupById } from '../shared/utils/dedupById';
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
  /**
   * Pushed-context back handler. Mutually exclusive with `tabRoot` and
   * `hideHeader` in practice — RootNavigator only passes `onBack` for
   * non-tab-root entries.
   */
  onBack?: () => void;
  /**
   * Legacy: when true, suppress the default TopBar entirely (no header,
   * no hamburger, no back). Kept for backward compatibility with any future
   * caller that wants a header-less chat surface. RootNavigator no longer
   * sets this; use `tabRoot` instead for the drawer-root entry.
   */
  hideHeader?: boolean;
  /**
   * When true, render a minimal TopBar containing only the ☰ (open-drawer)
   * button — used by RootNavigator's ChatStack root so the user can open
   * the side drawer from the chat surface. Mutually exclusive with
   * `onBack` and `hideHeader`.
   */
  tabRoot?: boolean;
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

export function ConversationScreen({ conversationId, onBack, hideHeader, tabRoot }: Props) {
  const queryClient = useQueryClient();
  const baseUrl = getApiBaseUrl();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const openDrawer = useCallback(
    () => navigation.dispatch(DrawerActions.openDrawer()),
    [navigation],
  );

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

  const {
    data,
    isPending,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...chatQueries.messages(resolvedId ?? ''),
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

  // Flatten infinite-query pages (each page is asc) and dedup by id BEFORE any
  // reversal so consumers downstream never see duplicate keys at page
  // boundaries (e.g. the canonical row appearing in both pages right after a
  // SSE-done refresh).
  const conversation = data?.pages[0]?.conversation;
  const baseMessages = useMemo<ChatMessage[]>(
    () => dedupById(data?.pages.flatMap((p) => p.messages) ?? []),
    [data],
  );
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
  // FlatList `inverted` consumes a reversed array: index 0 is the newest
  // (visually at the bottom) and the last item is the oldest (visually at the
  // top). dedup MUST happen before reverse and before FlatList consumption.
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

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

  const handleSend = async (overrideContent?: string) => {
    if (!resolvedId) return;
    // Voice path passes recognized text directly so we don't race the
    // setText() that the keyboard path relies on.
    const content = (overrideContent ?? text).trim();
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
            // Flush remaining buffer before refreshing the first page so the
            // user never sees text jump from mid-typewriter to the full
            // response.
            flushBuffer();
          },
        },
      );
      // Refresh page 0 only (NOT all pages, to avoid spurious refetch of every
      // previously-loaded older page). React Query v5 removed `refetchPage`, so
      // we manually fetch page 0 and splice it into the cache; dedup-by-id in
      // `baseMessages` protects against boundary overlap with page 1.
      const fresh = await fetchConversation(resolvedId, undefined, 50);
      const key = chatQueries.messages(resolvedId).queryKey;
      queryClient.setQueryData<
        { pages: ConversationDetail[]; pageParams: (string | undefined)[] } | undefined
      >(key, (old) => ({
        pages: [fresh, ...(old?.pages.slice(1) ?? [])],
        pageParams: [undefined, ...(old?.pageParams.slice(1) ?? [])],
      }));
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
    // FlatList `inverted` consumes `reversedMessages`: index 0 is the newest
    // and `index + 1` is the message that came chronologically *just before*
    // `item`. Insert a TimeSeparator at the visual top of each day's block,
    // i.e. when the previous-in-time message is missing or on a different day.
    const prevInTime =
      index + 1 < reversedMessages.length ? reversedMessages[index + 1] : null;
    const showSeparator =
      !prevInTime ||
      new Date(item.created_at).toDateString() !==
        new Date(prevInTime.created_at).toDateString();
    return (
      <>
        <MessageBubble
          message={item}
          imageUri={uri}
          imageHeaders={uri ? imageHeaders : undefined}
          senderName={isOwnMessage ? meta.name : undefined}
          senderRole={isOwnMessage ? meta.role : undefined}
          isStreaming={item.id === 'temp-assistant'}
        />
        {/* In an inverted FlatList, JSX rendered AFTER the bubble visually
            appears ABOVE it (column-reverse). Putting the separator here
            anchors it at the visual top of each day's block. */}
        {showSeparator && <TimeSeparator timestamp={item.created_at} />}
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
      <View style={[styles.canvas, hideHeader ? { paddingTop: insets.top } : undefined]}>
        {tabRoot ? (
          <TopBar title="管家" onMenu={openDrawer} />
        ) : hideHeader ? null : (
          <TopBar title="管家" onBack={onBack} />
        )}
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
    <View style={[styles.canvas, hideHeader ? { paddingTop: insets.top } : undefined]}>
      {tabRoot ? (
        <TopBar
          title={conversation?.summary ?? '管家'}
          onMenu={openDrawer}
        />
      ) : hideHeader ? null : (
        <TopBar
          title={conversation?.summary ?? '管家'}
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
          inverted
          ref={listRef}
          data={reversedMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: spacing['4'] },
          ]}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.loadMore}>
                <ActivityIndicator size="small" color={colors['fawn-amber']} />
              </View>
            ) : null
          }
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
          onVoiceTranscribed={(voiceText) => {
            // Send directly (skip draft step). handleSend takes the recognized
            // text as an override so it sends regardless of the text state.
            void handleSend(voiceText);
          }}
          onVoiceUploadStart={() => {
            // Paint an empty user bubble — MessageBubble renders ThinkingDots
            // (same animation as the assistant streaming wait) when content
            // is empty. Cleared on success (handleSend overwrites with real
            // content) or failure (onVoiceUploadEnd below).
            setOptimisticUser({ content: '', imageUrl: null });
          }}
          onVoiceUploadEnd={(success) => {
            // On failure / empty result: drop the placeholder. On success
            // handleSend below will overwrite optimisticUser with the real
            // content, so we only clear on the failure path.
            if (!success) setOptimisticUser(null);
          }}
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
  loadMore: {
    paddingVertical: spacing['3'],
    alignItems: 'center',
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
