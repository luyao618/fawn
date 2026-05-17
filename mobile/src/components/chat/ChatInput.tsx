import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  iconButtonRadius,
  layout,
  radii,
  shadows,
  spacing,
  typography,
} from '../../shared/theme';

/**
 * ChatInput — Android equivalent of `frontend/src/components/chat/ChatInput.tsx`.
 *
 * - Rounded pill (30px) white surface with `shadow-float`.
 * - Left circular `+` button reserved for attach (image picker).
 * - Multiline `TextInput` with `warm-gray` pill background.
 * - Right circular send button: brand `fawn-amber` when enabled, muted
 *   `oat-border` when disabled. All visuals from `shared/theme.ts`.
 * - Attached image preview row sits above the pill (mirrors Web).
 */

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Triggered when the user taps the attach (`+`) button. */
  onAttachImage: () => void;
  /** Local URI for the pending attachment preview, if any. */
  attachedImageUri?: string | null;
  /** Remove the currently attached image. */
  onRemoveImage?: () => void;
  /** Disable input + buttons while a send is in flight. */
  sending?: boolean;
  /** Show a spinner on the attach button while uploading. */
  uploading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChangeText,
  onSend,
  onAttachImage,
  attachedImageUri,
  onRemoveImage,
  sending,
  uploading,
  placeholder,
}: Props) {
  const canSend = (value.trim().length > 0 || !!attachedImageUri) && !sending && !uploading;

  return (
    <View style={styles.wrapper}>
      {attachedImageUri ? (
        <View style={styles.attachPreview}>
          <Image source={{ uri: attachedImageUri }} style={styles.attachThumb} />
          <Text style={styles.attachLabel} numberOfLines={1}>
            已附加图片
          </Text>
          {onRemoveImage ? (
            <Pressable
              onPress={onRemoveImage}
              accessibilityRole="button"
              accessibilityLabel="移除图片"
              style={styles.removeButton}
              hitSlop={6}
            >
              <Ionicons name="close" size={18} color={colors['dark-gray']} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.pill}>
        <Pressable
          onPress={onAttachImage}
          disabled={!!(uploading || sending)}
          accessibilityRole="button"
          accessibilityLabel="附加图片"
          style={({ pressed }) => [
            styles.attachButton,
            pressed && styles.attachButtonPressed,
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors['dark-gray']} />
          ) : (
            <Ionicons name="add" size={22} color={colors['dark-gray']} />
          )}
        </Pressable>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={uploading ? '图片上传中...' : placeholder ?? '输入消息...'}
          placeholderTextColor={colors['mid-gray']}
          multiline
          editable={!sending}
        />

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="发送"
          style={[
            styles.sendButton,
            canSend ? styles.sendButtonActive : styles.sendButtonDisabled,
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors['on-brand']} />
          ) : (
            <Ionicons
              name="send"
              size={18}
              color={canSend ? colors['on-brand'] : colors['mid-gray']}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['2'],
    paddingBottom: spacing['3'],
    backgroundColor: colors.transparent,
  },
  attachPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    backgroundColor: colors['card-frosted'],
    borderRadius: radii.lg,
    padding: spacing['2'],
    marginBottom: spacing['2'],
    ...shadows.card,
  },
  attachThumb: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
  },
  attachLabel: {
    ...typography.bodySmall,
    flex: 1,
    color: colors['dark-gray'],
  },
  removeButton: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: iconButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-gray'],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing['2'],
    backgroundColor: colors.card,
    borderRadius: radii.tabbar, // 30 — matches Web rounded-[30px]
    padding: spacing['2'],
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    ...shadows.float,
  },
  attachButton: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: iconButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-gray'],
  },
  attachButtonPressed: {
    backgroundColor: colors['nursery-mint'],
  },
  input: {
    flex: 1,
    minHeight: layout.iconButton,
    maxHeight: 120,
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.input,
    paddingHorizontal: spacing['4'],
    paddingVertical: spacing['2'],
    ...typography.inputBody,
  },
  sendButton: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: iconButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: colors['fawn-amber'],
    ...shadows.card,
  },
  sendButtonDisabled: {
    backgroundColor: colors['oat-border'],
  },
});
