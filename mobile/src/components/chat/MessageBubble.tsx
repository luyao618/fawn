import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from '../../shared/theme';
import type { ChatMessage } from '../../shared/api';
import { MarkdownMessage } from './MarkdownMessage';
import { SafetyAlert } from './SafetyAlert';
import { ThinkingDots } from './ThinkingDots';

/**
 * Chat bubble — Android equivalent of `frontend/src/components/chat/MessageBubble.tsx`.
 *
 * Visual rules (all sourced from `shared/theme.ts`):
 *   - User bubble: brand `fawn-amber` background, white text, right-aligned,
 *     22px radius with reduced bottom-right corner, soft `shadow-card`.
 *   - Assistant bubble: no background (transparent on the canvas), max-width
 *     ~92%, body text in `soft-charcoal`. Markdown is rendered via
 *     MarkdownMessage; safety alerts use SafetyAlert; image messages render
 *     a 64% width cover photo with rounded corners.
 *   - Sender meta (name + role chip) on user bubbles only, top-right.
 */

interface Props {
  message: ChatMessage;
  /** Resolved image URI (if any) so the parent can attach auth headers. */
  imageUri?: string | null;
  /** Optional headers for the authenticated image fetch. */
  imageHeaders?: Record<string, string>;
  /** Sender display name shown on user bubbles. */
  senderName?: string;
  /** Sender role label shown on user bubbles (e.g. 妈妈 / 爸爸). */
  senderRole?: string;
  /** Show a soft pulsing caret while the assistant message streams in. */
  isStreaming?: boolean;
}

function StreamingCaret() {
  return <Text style={styles.caret}>▍</Text>;
}

export function MessageBubble({
  message,
  imageUri,
  imageHeaders,
  senderName,
  senderRole,
  isStreaming,
}: Props) {
  const isUser = message.role === 'user';

  if (!isUser) {
    return (
      <View style={styles.rowLeft}>
        <View style={styles.assistantBubble}>
          {message.message_type === 'safety_alert' ? (
            <SafetyAlert content={message.content} />
          ) : imageUri ? (
            <ExpoImage
              source={imageHeaders ? { uri: imageUri, headers: imageHeaders } : { uri: imageUri }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityLabel="聊天图片"
            />
          ) : isStreaming && message.content === '' ? (
            <ThinkingDots />
          ) : (
            <>
              <MarkdownMessage content={message.content} textColor={colors['soft-charcoal']} />
              {isStreaming ? <StreamingCaret /> : null}
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.columnRight}>
      {(senderName || senderRole) ? (
        <View style={styles.senderRow}>
          {senderName ? (
            <Text style={styles.senderName} numberOfLines={1}>
              {senderName}
            </Text>
          ) : null}
          {senderRole ? (
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>{senderRole}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.rowRight}>
        <View style={styles.userBubble}>
          {imageUri ? (
            <ExpoImage
              source={imageHeaders ? { uri: imageUri, headers: imageHeaders } : { uri: imageUri }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityLabel="聊天图片"
            />
          ) : null}
          {message.content ? (
            <Text style={styles.userBubbleText}>{message.content}</Text>
          ) : !imageUri ? (
            // Empty user bubble = voice ASR placeholder during the upload
            // roundtrip. Use the same ThinkingDots animation as the assistant
            // streaming wait, tinted white to read on the amber bubble.
            <ThinkingDots color={colors['on-brand']} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowLeft: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginVertical: spacing['1'],
  },
  rowRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  columnRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginVertical: spacing['1'],
    gap: spacing['1'],
  },
  assistantBubble: {
    maxWidth: '92%',
    paddingHorizontal: spacing['1'],
    paddingVertical: spacing['1'],
    backgroundColor: colors.transparent,
    gap: spacing['2'],
  },
  userBubble: {
    maxWidth: '78%',
    backgroundColor: colors['bubble-user'],
    borderRadius: radii.bubbleUser,
    borderBottomRightRadius: radii.md,
    paddingHorizontal: spacing['4'],
    paddingVertical: spacing['3'],
    gap: spacing['1'],
    ...shadows.card,
  },
  userBubbleText: {
    ...typography.body,
    color: colors['on-brand'],
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing['1'],
    paddingHorizontal: spacing['1'],
  },
  senderName: {
    ...typography.metaSm,
    color: colors['dark-gray'],
    maxWidth: 140,
  },
  roleChip: {
    backgroundColor: colors['fawn-amber-light'],
    paddingHorizontal: spacing['2'],
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  roleChipText: {
    ...typography.metaXs,
    color: colors['brand-strong'],
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: radii.lg,
  },
  caret: {
    ...typography.body,
    color: colors['mid-gray'],
    marginTop: 2,
  },
});
