import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { VoiceHoldButton } from './VoiceHoldButton';
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
 * - Left circular `+` button opens action menu (attach image, history nav).
 * - Multiline `TextInput` with `warm-gray` pill background.
 * - Right circular send button: brand `fawn-amber` when enabled, muted
 *   `oat-border` when disabled. All visuals from `shared/theme.ts`.
 * - Attached image preview row sits above the pill (mirrors Web).
 *
 * Ergonomics (mirrors 42d40a0): + button action menu includes history entry
 * when `onOpenHistory` is provided. keepInputVisibleOnMobile removed —
 * keyboard avoidance is handled by the parent KeyboardAvoidingView.
 */

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Triggered when the user taps attach in the action menu. */
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
  /** Optional handler for navigating to history from the + action menu. */
  onOpenHistory?: () => void;
  /** When provided, the mic button is rendered to the left of the send button. */
  onVoiceTranscribed?: (text: string) => void;
  /** Called the moment a voice recording finishes recording and starts
   * uploading. Lets the parent paint a placeholder user bubble during the
   * ASR roundtrip. */
  onVoiceUploadStart?: () => void;
  /** Called when the upload roundtrip ends. `success=false` means the
   * placeholder bubble should be removed (no text was recognized / error). */
  onVoiceUploadEnd?: (success: boolean) => void;
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
  onOpenHistory,
  onVoiceTranscribed,
  onVoiceUploadStart,
  onVoiceUploadEnd,
}: Props) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [mode, setMode] = useState<'keyboard' | 'voice'>('keyboard');
  const inputRef = useRef<TextInput>(null);
  const canSend = (value.trim().length > 0 || !!attachedImageUri) && !sending && !uploading;
  const canUpload = !uploading && !sending;
  const canOpenActions = canUpload || Boolean(onOpenHistory);

  function switchToVoice() {
    // Blur synchronously THEN dismiss the IME — order matters on Vivo/OPPO
    // where the IME re-attaches to the next focusable view after blur if
    // dismiss isn't queued behind it.
    inputRef.current?.blur();
    Keyboard.dismiss();
    setActionMenuOpen(false);
    setMode('voice');
  }

  function switchToKeyboard() {
    setMode('keyboard');
    // Intentionally do NOT autofocus — the user taps the input to bring
    // the keyboard back, which avoids surprise IME pop on a "back to text"
    // tap when they only wanted to see the field again.
  }

  function handleAttachPress() {
    if (!canOpenActions) return;
    setActionMenuOpen((v) => !v);
  }

  function handleAttachImage() {
    setActionMenuOpen(false);
    if (canUpload) onAttachImage();
  }

  function handleOpenHistory() {
    setActionMenuOpen(false);
    onOpenHistory?.();
  }

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

      {/* Action menu popup */}
      {actionMenuOpen ? (
        <View style={styles.actionMenu}>
          {onOpenHistory ? (
            <Pressable
              onPress={handleOpenHistory}
              accessibilityRole="menuitem"
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Text style={styles.menuItemText}>历史记录</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleAttachImage}
            disabled={!canUpload}
            accessibilityRole="menuitem"
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
              !canUpload && styles.menuItemDisabled,
            ]}
          >
            <Text style={[styles.menuItemText, !canUpload && styles.menuItemTextDisabled]}>
              附加图片
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.pill}>
        <Pressable
          onPress={handleAttachPress}
          disabled={!canOpenActions}
          accessibilityRole="button"
          accessibilityLabel="更多操作"
          style={({ pressed }) => [
            styles.attachButton,
            pressed && styles.attachButtonPressed,
            actionMenuOpen && styles.attachButtonActive,
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors['dark-gray']} />
          ) : (
            <Ionicons
              name={actionMenuOpen ? 'close' : 'add'}
              size={22}
              color={colors['dark-gray']}
            />
          )}
        </Pressable>

        {mode === 'keyboard' ? (
          <>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={value}
              onChangeText={onChangeText}
              onFocus={() => setActionMenuOpen(false)}
              placeholder={uploading ? '图片上传中...' : placeholder ?? '输入消息...'}
              placeholderTextColor={colors['mid-gray']}
              multiline
              editable={!sending}
            />

            {onVoiceTranscribed ? (
              <Pressable
                onPress={switchToVoice}
                accessibilityRole="button"
                accessibilityLabel="切换到语音输入"
                style={styles.modeToggleButton}
              >
                <Ionicons name="mic-outline" size={22} color={colors['dark-gray']} />
              </Pressable>
            ) : null}

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
          </>
        ) : (
          <>
            <VoiceHoldButton
              disabled={sending || uploading}
              onTranscribed={(text) => {
                onVoiceTranscribed?.(text);
                // 保持 voice 模式 —— 与豆包一致，连续语音输入更顺手
              }}
              onUploadStart={onVoiceUploadStart}
              onUploadEnd={onVoiceUploadEnd}
            />
            <Pressable
              onPress={switchToKeyboard}
              accessibilityRole="button"
              accessibilityLabel="切换到文字输入"
              style={styles.modeToggleButton}
            >
              <Ionicons name="keypad-outline" size={22} color={colors['dark-gray']} />
            </Pressable>
          </>
        )}
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
  actionMenu: {
    position: 'absolute',
    bottom: 72,
    left: spacing['4'],
    width: 176,
    backgroundColor: colors['card-translucent'],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    padding: spacing['1'],
    ...shadows.float,
    zIndex: 20,
  },
  menuItem: {
    minHeight: 44,
    borderRadius: radii.md,
    paddingHorizontal: spacing['3'],
    justifyContent: 'center',
  },
  menuItemPressed: {
    backgroundColor: colors['warm-gray'],
  },
  menuItemDisabled: {
    opacity: 0.4,
  },
  menuItemText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors['soft-charcoal'],
  },
  menuItemTextDisabled: {
    color: colors['mid-gray'],
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
  attachButtonActive: {
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
  modeToggleButton: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: iconButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['warm-gray'],
  },
});
