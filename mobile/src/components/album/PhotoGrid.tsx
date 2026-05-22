// Album photo grid — mirrors `frontend/src/components/album/PhotoGrid.tsx`.
//
// Photos are grouped by the photo timeline and rendered as a 2-column grid of
// rounded tiles with a label strip across the bottom. Every visual constant
// (radius / spacing / color / typography) comes from `shared/theme` so the
// surface stays in sync with the Web tokens.

import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radii, shadows, spacing, typography } from '../../shared/theme';
import type { PhotoRecord } from '../../shared/api';
import { formatAppDate } from '../../lib/utils';
import { resolvePhotoUri } from './resolvePhotoUri';

interface PhotoGridProps {
  photos: PhotoRecord[];
  onPhotoPress: (photo: PhotoRecord) => void;
}

function photoTime(photo: PhotoRecord): string {
  return photo.taken_at ?? photo.uploaded_at;
}

function formatTimelineLabel(value: string): string {
  return formatAppDate(value, 'yyyy年M月d日');
}

export function PhotoGrid({ photos, onPhotoPress }: PhotoGridProps) {
  const groups = useMemo(() => {
    const map = new Map<string, PhotoRecord[]>();
    for (const photo of photos) {
      const key = formatTimelineLabel(photoTime(photo));
      const arr = map.get(key);
      if (arr) arr.push(photo);
      else map.set(key, [photo]);
    }
    return Array.from(map.entries());
  }, [photos]);

  if (photos.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[typography.body, styles.emptyText]}>
          还没有照片。上传后，这里会按拍摄时间自动整理。
        </Text>
      </View>
    );
  }

  // Two-column grid. We compute the tile width from screen width so each row
  // sits flush with the screen padding regardless of device size.
  const screenWidth = Dimensions.get('window').width;
  const horizontalPadding = spacing['4'] * 2;
  const gap = spacing['3'];
  const tileWidth = (screenWidth - horizontalPadding - gap) / 2;

  return (
    <View style={styles.root}>
      {groups.map(([group, items]) => (
        <View key={group} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[typography.bodySmall, styles.sectionTitle]} numberOfLines={1}>
              {group}
            </Text>
            <Text style={[typography.caption, styles.sectionCount]}>
              {items.length} 张
            </Text>
          </View>
          <View style={[styles.grid, { gap }]}>
            {items.map((photo) => {
              const time = photoTime(photo);
              const dateLabel = formatAppDate(time);
              return (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityLabel={`查看照片：${dateLabel}`}
                  onPress={() => onPhotoPress(photo)}
                  style={({ pressed }) => [
                    styles.tile,
                    { width: tileWidth, height: tileWidth * 1.25 },
                    pressed && styles.tilePressed,
                  ]}
                >
                  <Image
                    source={{ uri: resolvePhotoUri(photo.storage_url) }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    accessibilityLabel={photo.original_filename}
                  />
                  <View style={styles.tileOverlay}>
                    <Text style={[typography.overlayCaption, styles.tileDate]} numberOfLines={1}>
                      {dateLabel}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing['5'],
  },
  section: {
    gap: spacing['2'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['1'],
  },
  sectionTitle: {
    color: colors['dark-gray'],
    fontWeight: '600',
    flexShrink: 1,
  },
  sectionCount: {
    color: colors['mid-gray'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    borderRadius: radii.tile,
    overflow: 'hidden',
    backgroundColor: colors['warm-gray'],
    ...shadows.card,
  },
  tilePressed: {
    transform: [{ scale: 0.99 }],
  },
  tileOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing['3'],
    paddingTop: spacing['10'],
    // Subtle dark gradient is approximated with a translucent overlay token —
    // RN lacks first-party gradients and we don't want to pull in a new dep.
    backgroundColor: colors['overlay-scrim'],
  },
  tileDate: {
    opacity: 0.85,
  },
  empty: {
    borderRadius: radii.card,
    backgroundColor: colors['card'],
    padding: spacing['6'],
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    ...shadows.card,
  },
  emptyText: {
    color: colors['dark-gray'],
    textAlign: 'center',
  },
});
