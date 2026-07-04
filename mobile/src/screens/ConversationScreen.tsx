import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import {
  chatImageUrl,
  chatQueries,
  createConversation,
  fetchConversation,
  messageTtsSource,
  queryKeys,
  resolveChatImageUrl,
  sendChatMessage,
  uploadChatImage,
  type ChatMessage,
  type ConversationDetail,
} from '../shared/api';
import { dedupById } from '../shared/utils/dedupById';
import { useAuth } from '../auth/AuthContext';
import { getApiBaseUrl, getApiErrorMessage } from '../lib/api';
import { getToken } from '../lib/tokenStorage';
import type { User } from '../lib/types';
import { roleLabel } from '../lib/utils';
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
import {
  getChatTtsSpeakerEnabled,
  setChatTtsSpeakerEnabled,
} from '../shared/settings/storage';

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
  mimeType: string;
  filename: string;
}

interface LoadedArchiveConversation {
  conversationId: string;
  pages: ConversationDetail[];
}

const MIN_AUTOFILL_TIMELINE_MESSAGES = 12;
type TtsPlaybackState = 'idle' | 'loading' | 'playing' | 'stopped' | 'error';

function senderMeta(sender: Pick<User, 'display_name' | 'role'> | null | undefined) {
  return {
    name: sender?.display_name?.trim() || '家庭成员',
    role: roleLabel(sender?.role),
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
  const conversationHistoryQuery = useInfiniteQuery({
    ...chatQueries.history(50),
    enabled: !conversationId,
  });
  const conversationHistoryItems = useMemo(() => {
    const pageItems = conversationHistoryQuery.data?.pages.flatMap((page) => page.items) ?? [];
    return dedupById(pageItems.length > 0 ? pageItems : conversationsQuery.data ?? []);
  }, [conversationHistoryQuery.data, conversationsQuery.data]);
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
  const [ttsEnabled, setTtsEnabled] = useState(() => getChatTtsSpeakerEnabled());
  const [latestTtsMessageId, setLatestTtsMessageId] = useState<string | null>(null);
  const [activeTtsMessageId, setActiveTtsMessageId] = useState<string | null>(null);
  const [ttsPlaybackState, setTtsPlaybackState] = useState<TtsPlaybackState>('idle');
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
  const [archiveGroups, setArchiveGroups] = useState<LoadedArchiveConversation[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveExhausted, setArchiveExhausted] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [listContentHeight, setListContentHeight] = useState(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const ttsPlayerRef = useRef<AudioPlayer | null>(null);
  const ttsListenerRef = useRef<{ remove: () => void } | null>(null);
  const ttsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsRequestRef = useRef(0);
  const autoPlayedTtsMessageId = useRef<string | null>(null);
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

  const releaseTtsPlayer = useCallback(() => {
    if (ttsTimeoutRef.current !== null) {
      clearTimeout(ttsTimeoutRef.current);
      ttsTimeoutRef.current = null;
    }
    ttsListenerRef.current?.remove();
    ttsListenerRef.current = null;
    const player = ttsPlayerRef.current;
    ttsPlayerRef.current = null;
    if (!player) return;
    try {
      player.pause();
    } catch {
      // Player may already be removed or failed to load.
    }
    try {
      player.remove();
    } catch {
      // Best-effort cleanup only.
    }
  }, []);

  const stopLatestTts = useCallback((nextState: TtsPlaybackState = 'stopped') => {
    ttsRequestRef.current += 1;
    releaseTtsPlayer();
    setActiveTtsMessageId(null);
    setTtsPlaybackState(nextState);
  }, [releaseTtsPlayer]);

  const playLatestTts = useCallback(
    async (messageId: string) => {
      const requestId = ttsRequestRef.current + 1;
      ttsRequestRef.current = requestId;
      releaseTtsPlayer();
      setActiveTtsMessageId(messageId);
      setTtsPlaybackState('loading');

      const token = authToken ?? (await getToken());
      if (!token) {
        if (ttsRequestRef.current === requestId) setTtsPlaybackState('error');
        return;
      }
      if (!authToken) setAuthToken(token);

      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
        if (ttsRequestRef.current !== requestId) return;

        const player = createAudioPlayer(messageTtsSource(baseUrl, messageId, token), {
          updateInterval: 250,
        });
        ttsPlayerRef.current = player;
        ttsTimeoutRef.current = setTimeout(() => {
          if (ttsRequestRef.current !== requestId) return;
          releaseTtsPlayer();
          setActiveTtsMessageId(messageId);
          setTtsPlaybackState('error');
        }, 30000);
        ttsListenerRef.current = player.addListener('playbackStatusUpdate', (status) => {
          if (ttsRequestRef.current !== requestId) return;
          if (status.didJustFinish) {
            releaseTtsPlayer();
            setActiveTtsMessageId(null);
            setTtsPlaybackState('idle');
            return;
          }
          if (status.playing) {
            if (ttsTimeoutRef.current !== null) {
              clearTimeout(ttsTimeoutRef.current);
              ttsTimeoutRef.current = null;
            }
            setTtsPlaybackState('playing');
          }
        });
        player.play();
        setTtsPlaybackState('playing');
      } catch {
        if (ttsRequestRef.current === requestId) {
          releaseTtsPlayer();
          setActiveTtsMessageId(messageId);
          setTtsPlaybackState('error');
        }
      }
    },
    [authToken, baseUrl, releaseTtsPlayer],
  );

  const toggleTtsEnabled = useCallback(() => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    setChatTtsSpeakerEnabled(next);
    if (!next) stopLatestTts('idle');
  }, [stopLatestTts, ttsEnabled]);

  const handleVoiceActionPress = useCallback(
    (messageId: string) => {
      if (
        activeTtsMessageId === messageId &&
        (ttsPlaybackState === 'loading' || ttsPlaybackState === 'playing')
      ) {
        stopLatestTts('stopped');
        return;
      }
      void playLatestTts(messageId);
    },
    [activeTtsMessageId, playLatestTts, stopLatestTts, ttsPlaybackState],
  );

  // Flatten infinite-query pages (each page is asc) and dedup by id BEFORE any
  // reversal so consumers downstream never see duplicate keys at page
  // boundaries (e.g. the canonical row appearing in both pages right after a
  // SSE-done refresh).
  const conversation = data?.pages[0]?.conversation;
  const baseMessages = useMemo<ChatMessage[]>(
    () => dedupById(data?.pages.flatMap((p) => p.messages) ?? []),
    [data],
  );
  const archiveMessages = useMemo<ChatMessage[]>(() => {
    const chronologicalGroups = [...archiveGroups].reverse();
    return dedupById(
      chronologicalGroups.flatMap((group) =>
        group.pages.flatMap((page) => page.messages),
      ),
    );
  }, [archiveGroups]);
  // Synthesize the optimistic user + streaming assistant rows at the tail of
  // the list. Using a stable, prefixed id keeps FlatList's keyExtractor happy
  // and avoids collisions with real server ids (UUIDs).
  const messages = useMemo<ChatMessage[]>(() => {
    if (!resolvedId) return baseMessages;
    const timelineBase =
      !conversationId && archiveMessages.length > 0
        ? [...archiveMessages, ...baseMessages]
        : baseMessages;
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
    return extras.length > 0 ? [...timelineBase, ...extras] : timelineBase;
  }, [
    archiveMessages,
    baseMessages,
    conversationId,
    optimisticUser,
    streamingAssistant,
    resolvedId,
    user?.id,
  ]);
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

  useEffect(() => {
    return () => {
      ttsRequestRef.current += 1;
      releaseTtsPlayer();
    };
  }, [releaseTtsPlayer]);

  const imageHeaders = useMemo(
    () => (authToken ? { Authorization: `Bearer ${authToken}` } : undefined),
    [authToken],
  );
  const isTimelineShort =
    reversedMessages.length < MIN_AUTOFILL_TIMELINE_MESSAGES ||
    (listViewportHeight > 0 &&
      listContentHeight > 0 &&
      listContentHeight <= listViewportHeight);

  useEffect(() => {
    stopLatestTts('idle');
    setLatestTtsMessageId(null);
    autoPlayedTtsMessageId.current = null;
    setArchiveGroups([]);
    setArchiveLoading(false);
    setArchiveExhausted(false);
    setArchiveError(null);
    setListContentHeight(0);
  }, [resolvedId, stopLatestTts]);

  const olderConversationIds = useMemo(() => {
    if (!resolvedId) return [];
    const currentIndex = conversationHistoryItems.findIndex(
      (item) => item.id === resolvedId,
    );
    if (currentIndex < 0) return [];
    return conversationHistoryItems.slice(currentIndex + 1).map((item) => item.id);
  }, [conversationHistoryItems, resolvedId]);

  const loadOlderTimeline = useCallback(async () => {
    if (isFetchingNextPage || archiveLoading || conversationHistoryQuery.isFetchingNextPage) {
      return;
    }
    if (hasNextPage) {
      await fetchNextPage();
      return;
    }
    if (conversationId || !resolvedId || archiveExhausted) return;
    if (!conversationHistoryQuery.data && conversationHistoryQuery.isFetching) return;

    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const activeArchive = archiveGroups[archiveGroups.length - 1];
      const oldestArchivePage = activeArchive?.pages[0];
      if (
        activeArchive &&
        oldestArchivePage?.has_more &&
        oldestArchivePage.next_before
      ) {
        const olderPage = await fetchConversation(
          activeArchive.conversationId,
          oldestArchivePage.next_before,
          50,
        );
        setArchiveGroups((current) =>
          current.map((group, index) =>
            index === current.length - 1
              ? { ...group, pages: [olderPage, ...group.pages] }
              : group,
          ),
        );
        return;
      }

      const loadedConversationIds = new Set([
        resolvedId,
        ...archiveGroups.map((group) => group.conversationId),
      ]);
      let nextConversationId = olderConversationIds.find(
        (id) => !loadedConversationIds.has(id),
      );

      if (!nextConversationId && conversationHistoryQuery.hasNextPage) {
        const nextPageResult = await conversationHistoryQuery.fetchNextPage();
        const freshItems = dedupById(
          nextPageResult.data?.pages.flatMap((page) => page.items) ?? [],
        );
        const currentIndex = freshItems.findIndex((item) => item.id === resolvedId);
        const freshOlderIds =
          currentIndex >= 0 ? freshItems.slice(currentIndex + 1).map((item) => item.id) : [];
        nextConversationId = freshOlderIds.find(
          (id) => !loadedConversationIds.has(id),
        );
      }

      if (!nextConversationId) {
        setArchiveExhausted(true);
        return;
      }

      const nextConversation = await fetchConversation(nextConversationId, undefined, 50);
      setArchiveGroups((current) => [
        ...current,
        { conversationId: nextConversationId, pages: [nextConversation] },
      ]);
    } catch (err) {
      setArchiveError((err as Error)?.message ?? '加载更早历史失败');
    } finally {
      setArchiveLoading(false);
    }
  }, [
    archiveExhausted,
    archiveGroups,
    archiveLoading,
    conversationHistoryQuery,
    conversationId,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    olderConversationIds,
    resolvedId,
  ]);

  const handlePickImage = async () => {
    if (!resolvedId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('需要相册权限', '请在系统设置中授予相册访问权限');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const filename = asset.fileName ?? `upload-${Date.now()}.jpg`;
      const res = await uploadChatImage(resolvedId, asset.uri, mimeType, filename);
      setPendingImage({
        imageUrl: res.image_url,
        localUri: asset.uri,
        mimeType,
        filename,
      });
    } catch (err) {
      Alert.alert('上传失败', getApiErrorMessage(err));
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
    const sentImage = pendingImage;
    const sentContent = content || (pendingImage ? '[图片]' : '');
    const sentImageUrl = sentImage?.imageUrl ?? null;
    stopLatestTts('idle');
    setLatestTtsMessageId(null);
    autoPlayedTtsMessageId.current = null;
    // Clear composer + show optimistic rows synchronously so the keyboard
    // dismiss and bubbles land in the same frame.
    setText('');
    setPendingImage(null);
    setOptimisticUser({ content: sentContent, imageUrl: sentImageUrl });
    setStreamingAssistant({ content: '' });
    setSending(true);
    let completedMessageId: string | null = null;
    let completedMessageType: string | null = null;
    try {
      const token = authToken ?? (await getToken());
      if (token && !authToken) setAuthToken(token);
      const callbacks = {
        onToken: (chunk: string) => {
          pendingBuffer.current += chunk;
          startTypingTimer();
        },
        onDone: (messageId: string, messageType: string) => {
          completedMessageId = messageId || null;
          completedMessageType = messageType || 'text';
          // Flush remaining buffer before refreshing the first page so the
          // user never sees text jump from mid-typewriter to the full
          // response.
          flushBuffer();
        },
      };

      const sendOnce = async (
        targetConversationId: string,
        targetImageUrl: string | null,
      ) =>
        sendChatMessage(
          targetConversationId,
          sentContent,
          targetImageUrl,
          baseUrl,
          token,
          callbacks,
        );

      const retryAfterSessionExpired = async () => {
        // Expired sends are server-defined as non-persisting. Reset the local
        // streaming placeholder, resolve the current active conversation, then
        // replay the same user intent once. Image sends must be uploaded again
        // because the first image URL points at the expired conversation's
        // upload namespace.
        stopTypingTimer();
        pendingBuffer.current = '';
        setStreamingAssistant({ content: '' });

        const freshConversation = await createConversation();
        await queryClient.invalidateQueries({
          queryKey: chatQueries.conversations().queryKey,
        });

        let retryImageUrl: string | null = null;
        if (sentImage) {
          const uploaded = await uploadChatImage(
            freshConversation.id,
            sentImage.localUri,
            sentImage.mimeType,
            sentImage.filename,
          );
          retryImageUrl = uploaded.image_url;
        }
        setOptimisticUser({ content: sentContent, imageUrl: retryImageUrl });

        const retryResult = await sendOnce(freshConversation.id, retryImageUrl);
        if (retryResult.type === 'session_expired') {
          throw new Error('会话已过期，请重新发送');
        }
        return freshConversation.id;
      };

      const firstResult = await sendOnce(resolvedId, sentImageUrl);
      const completedConversationId =
        firstResult.type === 'session_expired'
          ? await retryAfterSessionExpired()
          : resolvedId;

      // Fetch the authoritative page 0 (the real user + assistant rows) BEFORE
      // touching any state, so the swap from optimistic → canonical happens in a
      // single render.
      const fresh = await fetchConversation(completedConversationId, undefined, 50);
      const messagesKey = chatQueries.messages(completedConversationId).queryKey;
      // Commit the fresh page into the cache and drop the optimistic rows in the
      // same React batch. Splicing page 0 (rather than invalidating the whole
      // ['chat'] tree) avoids force-refetching the on-screen messages query,
      // which would otherwise blank the timeline and relayout the inverted list —
      // the flicker where only the just-sent message is briefly visible. dedup-by-id
      // in `baseMessages` protects against boundary overlap with page 1.
      queryClient.setQueryData<
        { pages: ConversationDetail[]; pageParams: (string | undefined)[] } | undefined
      >(messagesKey, (old) => ({
        pages: [fresh, ...(old?.pages.slice(1) ?? [])],
        pageParams: [undefined, ...(old?.pageParams.slice(1) ?? [])],
      }));
      setOptimisticUser(null);
      setStreamingAssistant(null);
      // Refresh conversation-list / history previews in the background (title,
      // last-message, ordering) without blocking or refetching the visible
      // messages query.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.historyRoot(),
      });
      if (
        completedMessageId &&
        (completedMessageType === 'text' || completedMessageType === 'safety_alert')
      ) {
        setLatestTtsMessageId(completedMessageId);
        if (ttsEnabled && autoPlayedTtsMessageId.current !== completedMessageId) {
          autoPlayedTtsMessageId.current = completedMessageId;
          void playLatestTts(completedMessageId);
        }
      }
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
  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const ref = item.metadata?.image_url;
    const uri = ref ? resolveChatImageUrl(baseUrl, ref) : null;
    const isUserMessage = item.role === 'user';
    const fallbackSender =
      !item.sender_user_id || item.sender_user_id === user?.id ? user : null;
    const meta = senderMeta(item.sender ?? fallbackSender);
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
    const showVoiceAction =
      item.role === 'assistant' &&
      item.id === latestTtsMessageId &&
      item.id !== 'temp-assistant' &&
      (item.message_type === 'text' || item.message_type === 'safety_alert');
    const voiceActionState =
      activeTtsMessageId === item.id ? ttsPlaybackState : 'idle';
    return (
      <>
        <MessageBubble
          message={item}
          imageUri={uri}
          imageHeaders={uri ? imageHeaders : undefined}
          senderName={isUserMessage ? meta.name : undefined}
          senderRole={isUserMessage ? meta.role : undefined}
          isStreaming={item.id === 'temp-assistant'}
          showVoiceAction={showVoiceAction}
          voiceActionState={voiceActionState}
          onPressVoiceAction={() => handleVoiceActionPress(item.id)}
        />
        {/* In an inverted FlatList, JSX rendered AFTER the bubble visually
            appears ABOVE it (column-reverse). Putting the separator here
            anchors it at the visual top of each day's block. */}
        {showSeparator && <TimeSeparator timestamp={item.created_at} />}
      </>
    );
  };
  const isLoadingOlderTimeline =
    isFetchingNextPage || archiveLoading || conversationHistoryQuery.isFetchingNextPage;

  useEffect(() => {
    if (
      conversationId ||
      !resolvedId ||
      !data ||
      !conversationHistoryQuery.data ||
      conversationHistoryQuery.isFetching ||
      isLoadingOlderTimeline ||
      archiveExhausted ||
      !isTimelineShort
    ) {
      return;
    }
    void loadOlderTimeline();
  }, [
    archiveExhausted,
    conversationHistoryQuery.data,
    conversationHistoryQuery.isFetching,
    conversationId,
    data,
    isLoadingOlderTimeline,
    isTimelineShort,
    loadOlderTimeline,
    resolvedId,
  ]);

  const ttsHeaderAction = (
    <Pressable
      onPress={toggleTtsEnabled}
      accessibilityRole="button"
      accessibilityLabel={ttsEnabled ? '关闭语音播放' : '开启语音播放'}
      style={({ pressed }) => [
        styles.ttsToggle,
        ttsEnabled ? styles.ttsToggleEnabled : null,
        pressed ? styles.ttsTogglePressed : null,
      ]}
      hitSlop={8}
    >
      <Ionicons
        name={ttsEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
        size={22}
        color={ttsEnabled ? colors['fawn-amber'] : colors['soft-charcoal']}
      />
    </Pressable>
  );

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
        await queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
      } catch (err) {
        Alert.alert('新建会话失败', (err as Error).message);
      } finally {
        setCreating(false);
      }
    };
    return (
      <View style={[styles.canvas, hideHeader ? { paddingTop: insets.top } : undefined]}>
        {tabRoot ? (
          <TopBar title="" onMenu={openDrawer} rightAction={ttsHeaderAction} />
        ) : hideHeader ? null : (
          <TopBar title="" onBack={onBack} rightAction={ttsHeaderAction} />
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
          title=""
          onMenu={openDrawer}
          rightAction={ttsHeaderAction}
        />
      ) : hideHeader ? null : (
        <TopBar
          title=""
          onBack={onBack}
          rightAction={ttsHeaderAction}
        />
      )}

      {/* No KeyboardAvoidingView — relies on android:windowSoftInputMode=adjustResize
          (already set in AndroidManifest) so the root view shrinks when the
          keyboard appears and the composer naturally follows the new bottom edge.
          KAV's padding/height behaviors miscalculate the available area on cold
          start under edge-to-edge mode, leaving the composer floating ~660dp
          above the gesture bar until the first IME open. */}
      <View style={styles.flex}>
        {isError ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              离线 / 拉取失败，显示的是缓存数据。{'\n'}
              {(error as Error)?.message ?? ''}
            </Text>
          </View>
        ) : null}
        {archiveError ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              更早历史加载失败。{'\n'}
              {archiveError}
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
          onLayout={(event) => {
            setListViewportHeight(Math.ceil(event.nativeEvent.layout.height));
          }}
          onContentSizeChange={(_, height) => {
            setListContentHeight(Math.ceil(height));
          }}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: spacing['4'] },
          ]}
          onEndReached={() => {
            void loadOlderTimeline();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingOlderTimeline ? (
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
      </View>
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
  ttsToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.transparent,
  },
  ttsToggleEnabled: {
    backgroundColor: colors['card-frosted'],
    borderWidth: 1,
    borderColor: colors['frosted-border'],
  },
  ttsTogglePressed: {
    opacity: 0.72,
  },
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
