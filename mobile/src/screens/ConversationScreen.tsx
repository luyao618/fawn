import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Conversation (聊天) screen — visual parity with Web `app/(main)/chat/page.tsx`.
 *
 * All visuals come from `shared/theme.ts` (colors / radii / shadows / type).
 * Bubble visuals, markdown rendering, safety-alert styling and the rounded
 * composer pill live in `src/components/chat/*` so this screen is mostly
 * orchestration.
 */

interface Props {
  conversationId: string;
  onBack: () => void;
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

export function ConversationScreen({ conversationId, onBack }: Props) {
  const queryClient = useQueryClient();
  const baseUrl = getApiBaseUrl();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { data, isPending, isError, error, refetch, isFetching } = useQuery(
    chatQueries.conversation(conversationId),
  );

  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const messages = data?.messages ?? [];

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

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const handlePickImage = async () => {
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
      const res = await uploadChatImage(conversationId, asset.uri, mimeType, filename);
      setPendingImage({ imageUrl: res.image_url, localUri: asset.uri });
    } catch (err) {
      Alert.alert('上传失败', (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content && !pendingImage) return;
    setSending(true);
    try {
      const token = authToken ?? (await getToken());
      await sendChatMessage(
        conversationId,
        content || (pendingImage ? '[图片]' : ''),
        pendingImage?.imageUrl ?? null,
        baseUrl,
        token,
      );
      setText('');
      setPendingImage(null);
      await queryClient.invalidateQueries({
        queryKey: chatQueries.conversation(conversationId).queryKey,
      });
      await queryClient.invalidateQueries({
        queryKey: chatQueries.conversations().queryKey,
      });
    } catch (err) {
      Alert.alert('发送失败', (err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const meta = senderMeta(user);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const ref = item.metadata?.image_url;
    const uri = ref ? resolveChatImageUrl(baseUrl, ref) : null;
    const isOwnMessage =
      item.role === 'user' && (!item.sender_user_id || item.sender_user_id === user?.id);
    return (
      <MessageBubble
        message={item}
        imageUri={uri}
        imageHeaders={uri ? imageHeaders : undefined}
        senderName={isOwnMessage ? meta.name : undefined}
        senderRole={isOwnMessage ? meta.role : undefined}
      />
    );
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
        title={data?.conversation.summary ?? '管家'}
        onBack={onBack}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: spacing['4'] },
          ]}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
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
    ...typography.heading,
    fontSize: 16,
  },
  emptyBody: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
});
