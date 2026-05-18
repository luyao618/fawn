/**
 * PhotoImage — RN-idiomatic port of frontend/src/components/album/PhotoImage.tsx.
 *
 * Thin wrapper around expo-image with memory-disk cache policy and graceful
 * error fallback. Handles minio hostname rewriting (mobile equivalent of
 * resolvePhotoImageUrl) via the existing resolvePhotoUri utility.
 */

import React, { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { ImageStyle } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { resolvePhotoUri } from './resolvePhotoUri';
import { colors, radii, spacing, typography } from '../../shared/theme';

export interface PhotoImageProps {
  src: string;
  alt?: string;
  style?: ImageStyle;
  fallbackStyle?: ViewStyle;
}

export function PhotoImage({ src, alt, style, fallbackStyle }: PhotoImageProps) {
  const [hasError, setHasError] = useState(false);
  const resolvedSrc = resolvePhotoUri(src);

  if (hasError) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={alt ? `${alt} 加载失败` : '照片加载失败'}
        style={[styles.fallback, fallbackStyle]}
      >
        <Ionicons name="image-outline" size={28} color={colors['dark-gray']} style={styles.fallbackIcon} />
        <Text style={styles.fallbackText}>照片暂时无法加载</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: resolvedSrc }}
      accessibilityLabel={alt}
      cachePolicy="memory-disk"
      onError={() => setHasError(true)}
      style={[{ width: '100%', height: '100%' } as ImageStyle, style]}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.tile,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['2'],
  },
  fallbackIcon: {
    opacity: 0.5,
  },
  fallbackText: {
    ...typography.caption,
    color: colors['mid-gray'],
    paddingHorizontal: spacing['4'],
    textAlign: 'center',
    lineHeight: 20,
  },
});
