import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  chatImageUrl,
  chatQueries,
  resolveChatImageUrl,
  sendChatMessage,
  uploadChatImage,
  type ChatMessage,
} from '../shared/api';
import { getApiBaseUrl } from '../lib/api';
import { getToken } from '../lib/tokenStorage';

interface Props {
  conversationId: string;
  onBack: () => void;
}

interface PendingImage {
  imageUrl: string; // server-returned reference (e.g. /api/chat/.../images/xxx.jpg)
  localUri: string; // local file uri for instant preview
}

export function ConversationScreen({ conversationId, onBack }: Props) {
  const queryClient = useQueryClient();
  const baseUrl = getApiBaseUrl();
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
      // Re-fetch conversation so user + assistant rows land in cache.
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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.backText}>← 会话列表</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {data?.conversation.summary ?? '聊天'}
        </Text>
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
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        refreshing={isFetching}
        onRefresh={() => refetch()}
        ListEmptyComponent={
          <Text style={styles.empty}>还没有消息，在下方输入开始对话。</Text>
        }
      />

      {pendingImage && (
        <View style={styles.attachRow}>
          <ExpoImage
            source={{ uri: pendingImage.localUri }}
            style={styles.attachThumb}
            contentFit="cover"
            cachePolicy="memory"
          />
          <Text style={styles.attachLabel}>已附加图片</Text>
          <TouchableOpacity onPress={() => setPendingImage(null)}>
            <Text style={styles.attachRemove}>移除</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBar}>
        <TouchableOpacity
          style={[styles.iconButton, uploading && styles.buttonDisabled]}
          onPress={handlePickImage}
          disabled={uploading || sending}
          accessibilityRole="button"
          accessibilityLabel="附加图片"
        >
          <Text style={styles.iconButtonText}>{uploading ? '…' : '+图'}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="发消息…"
          placeholderTextColor="#999"
          multiline
          editable={!sending}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (sending || (!text.trim() && !pendingImage)) && styles.buttonDisabled,
          ]}
          onPress={handleSend}
          disabled={sending || (!text.trim() && !pendingImage)}
          accessibilityRole="button"
        >
          <Text style={styles.sendText}>{sending ? '…' : '发送'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// chatImageUrl is re-exported here to keep the public surface obvious to other
// future screens that may need to render images for a known filename.
export { chatImageUrl };

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
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  attachThumb: { width: 40, height: 40, borderRadius: 6, marginRight: 8 },
  attachLabel: { flex: 1, color: '#444', fontSize: 13 },
  attachRemove: { color: '#b03030', fontSize: 13, fontWeight: '600' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f1f3f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  iconButtonText: { color: '#2c7a4b', fontSize: 14, fontWeight: '600' },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fff',
  },
  sendButton: {
    marginLeft: 8,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2c7a4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});
