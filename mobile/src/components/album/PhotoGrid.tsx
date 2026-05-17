// Album photo grid — mirrors `frontend/src/components/album/PhotoGrid.tsx`.
//
// Photos are grouped by the selected `view` (timeline / scene / milestone),
// rendered as a 2-column grid of rounded tiles with a gradient label strip
// across the bottom — matching the Web visual exactly. Every visual constant
// (radius / spacing / color / typography) comes from `shared/theme` so the
// surface stays in sync with the Web tokens.

import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radii, shadows, spacing, typography } from '../../shared/theme';
import type { PhotoRecord } from '../../shared/api';
import { resolvePhotoUri } from './resolvePhotoUri';

export type AlbumView = 'timeline' | 'scene' | 'milestone';

interface PhotoGridProps {
  photos: PhotoRecord[];
  view: AlbumView;
  onPhotoPress: (photo: PhotoRecord) => void;
}

function formatGroupDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '未分类';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickGroupKey(photo: PhotoRecord, view: AlbumView): string {
  if (view === 'timeline') {
    return formatGroupDate(photo.taken_at ?? photo.uploaded_at);
  }
  if (view === 'scene') {
    return photo.tags.find((t) => t.tag_type === 'scene')?.tag_value ?? '未识别场景';
  }
  return photo.tags.find((t) => t.tag_type === 'milestone')?.tag_value ?? '普通照片';
}

function pickTileLabel(photo: PhotoRecord): string {
  return (
    photo.tags.find((t) => t.tag_type === 'milestone')?.tag_value ??
    photo.tags.find((t) => t.tag_type === 'scene')?.tag_value ??
    '照片'
  );
}

export function PhotoGrid({ photos, view, onPhotoPress }: PhotoGridProps) {
  const groups = useMemo(() => {
    const map = new Map<string, PhotoRecord[]>();
    for (const photo of photos) {
      const key = pickGroupKey(photo, view);
      const arr = map.get(key);
      if (arr) arr.push(photo);
      else map.set(key, [photo]);
    }
    return Array.from(map.entries());
  }, [photos, view]);

  if (photos.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[typography.body, styles.emptyText]}>
          还没有照片。上传后，这里会按时间、场景或里程碑自动整理。
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
              const label = pickTileLabel(photo);
              return (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityLabel={`查看照片：${label}`}
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
                    <Text style={styles.tileDate} numberOfLines={1}>
                      {formatShortDate(photo.taken_at ?? photo.uploaded_at)}
                    </Text>
                    <Text style={styles.tileLabel} numberOfLines={1}>
                      {label}
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

/**
 * Convenience wrapper that places the grid inside a vertical ScrollView with
 * the right outer padding. The AlbumScreen uses this so the page-level header
 * (mode tabs) can sit above and scroll together with the grid.
 */
export function PhotoGridScroll(
  props: PhotoGridProps & { header?: React.ReactNode; footerPadding?: number },
) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: props.footerPadding ?? spacing['12'] },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {props.header}
      <PhotoGrid {...props} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing['5'],
  },
  scrollContent: {
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['4'],
    gap: spacing['4'],
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
    borderRadius: radii.lg + 8, // mirrors Web `rounded-[24px]`
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
    // Subtle dark gradient is approximated with a translucent black overlay —
    // RN lacks first-party gradients and we don't want to pull in a new dep.
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  tileDate: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.85,
  },
  tileLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
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
