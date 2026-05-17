// Full-screen photo viewer — mirrors `frontend/src/components/album/PhotoViewer.tsx`.
//
// Layout matches the Web component:
//   - Header (filename + close button) on a dark gradient.
//   - Photo centered, fitted into the viewport.
//   - Footer with optional download/delete buttons + tag chips.
//
// Android gestures supported with stock RN primitives (no extra deps):
//   - Horizontal swipe to flip between sibling photos (FlatList paging).
//   - Double-tap to toggle 1× / 2× zoom on the active photo.
//   - One-finger drag to pan when zoomed in.
//
// We deliberately avoid pulling in `react-native-gesture-handler` /
// `react-native-reanimated`: they aren't currently in the mobile bundle and
// adding them just for the viewer would inflate the install footprint /
// require a native rebuild. Stock `Animated` + `PanResponder` is good enough
// for the AC ("手势缩放/滑动按 Android 习惯").

import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../../shared/theme';
import type { PhotoRecord } from '../../shared/api';
import { resolvePhotoUri } from './resolvePhotoUri';

interface PhotoViewerProps {
  photos: PhotoRecord[];
  initialPhotoId: string;
  onClose: () => void;
  onDownload?: (photo: PhotoRecord) => Promise<void> | void;
  onDelete?: (photo: PhotoRecord) => Promise<void> | void;
}

const DOUBLE_TAP_MS = 280;
const ZOOM_SCALE = 2;

export function PhotoViewer({
  photos,
  initialPhotoId,
  onClose,
  onDownload,
  onDelete,
}: PhotoViewerProps) {
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('window');

  const initialIndex = Math.max(
    0,
    photos.findIndex((p) => p.id === initialPhotoId),
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [pendingAction, setPendingAction] = useState<'download' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const current = photos[currentIndex] ?? photos[0];
  // If the underlying photo list shrinks (e.g. delete), clamp index so we
  // don't render an undefined item.
  useEffect(() => {
    if (currentIndex >= photos.length && photos.length > 0) {
      setCurrentIndex(photos.length - 1);
    }
  }, [currentIndex, photos.length]);

  const runAction = useCallback(
    async (kind: 'download' | 'delete', cb?: (photo: PhotoRecord) => Promise<void> | void) => {
      if (!cb || !current) return;
      setPendingAction(kind);
      setActionError(null);
      try {
        await cb(current);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setActionError(
          kind === 'download'
            ? `下载失败：${msg}`
            : `删除失败：${msg}`,
        );
      } finally {
        setPendingAction(null);
      }
    },
    [current],
  );

  const confirmDelete = useCallback(() => {
    if (!onDelete || !current) return;
    Alert.alert(
      '删除这张照片？',
      '照片会从相册隐藏，原始文件仍保留在存储中。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            void runAction('delete', onDelete);
          },
        },
      ],
    );
  }, [current, onDelete, runAction]);

  const visibleTags = current ? current.tags.slice(0, 3) : [];
  const extraTagCount = current ? current.tags.length - visibleTags.length : 0;

  if (!current) return null;

  return (
    <Modal
      visible
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: screen.width,
            offset: screen.width * index,
            index,
          })}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / screen.width);
            if (next !== currentIndex) {
              setCurrentIndex(next);
              setActionError(null);
            }
          }}
          renderItem={({ item, index }) => (
            <ZoomablePhoto
              photo={item}
              active={index === currentIndex}
              width={screen.width}
              height={screen.height}
            />
          )}
        />

        {/* Top gradient: filename + close */}
        <View
          pointerEvents="box-none"
          style={[
            styles.headerWrap,
            { paddingTop: insets.top + spacing['3'] },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.filename} numberOfLines={2}>
              {current.original_filename}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="关闭预览"
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.iconButtonPressed,
              ]}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          {photos.length > 1 ? (
            <Text style={styles.counter}>
              {currentIndex + 1} / {photos.length}
            </Text>
          ) : null}
          {actionError ? (
            <Text style={styles.errorPill}>{actionError}</Text>
          ) : null}
        </View>

        {/* Bottom gradient: action icons + tag chips */}
        <View
          pointerEvents="box-none"
          style={[
            styles.footerWrap,
            { paddingBottom: insets.bottom + spacing['3'] },
          ]}
        >
          <View style={styles.footer}>
            <View style={styles.actions}>
              {onDownload ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="下载照片"
                  disabled={pendingAction !== null}
                  onPress={() => void runAction('download', onDownload)}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pendingAction !== null && styles.iconButtonDisabled,
                    pressed && styles.iconButtonPressed,
                  ]}
                >
                  <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="删除照片"
                  disabled={pendingAction !== null}
                  onPress={confirmDelete}
                  style={({ pressed }) => [
                    styles.iconButton,
                    styles.iconButtonDanger,
                    pendingAction !== null && styles.iconButtonDisabled,
                    pressed && styles.iconButtonPressed,
                  ]}
                >
                  <Ionicons name="trash-outline" size={18} color="#FFD2CC" />
                </Pressable>
              ) : null}
            </View>
            {visibleTags.length > 0 ? (
              <View style={styles.tagColumn}>
                {visibleTags.map((tag) => (
                  <View key={tag.id} style={styles.tagChip}>
                    <Text style={styles.tagText} numberOfLines={1}>
                      {tag.tag_value}
                    </Text>
                  </View>
                ))}
                {extraTagCount > 0 ? (
                  <View style={styles.tagChip}>
                    <Text style={styles.tagText}>+{extraTagCount}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Zoomable image — double-tap to zoom, drag to pan while zoomed.
// ---------------------------------------------------------------------------

interface ZoomablePhotoProps {
  photo: PhotoRecord;
  active: boolean;
  width: number;
  height: number;
}

function ZoomablePhoto({ photo, active, width, height }: ZoomablePhotoProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Cached numeric copies so PanResponder math works without subscribing.
  const scaleValue = useRef(1);
  const translateXValue = useRef(0);
  const translateYValue = useRef(0);
  const lastTapAt = useRef(0);

  useEffect(() => {
    const s = scale.addListener(({ value }) => {
      scaleValue.current = value;
    });
    const x = translateX.addListener(({ value }) => {
      translateXValue.current = value;
    });
    const y = translateY.addListener(({ value }) => {
      translateYValue.current = value;
    });
    return () => {
      scale.removeListener(s);
      translateX.removeListener(x);
      translateY.removeListener(y);
    };
  }, [scale, translateX, translateY]);

  // Reset zoom whenever the photo scrolls out of view so neighbours don't
  // inherit our zoomed state when they return to focus.
  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
  }, [active, scale, translateX, translateY]);

  const resetZoom = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
    ]).start();
  }, [scale, translateX, translateY]);

  const zoomIn = useCallback(() => {
    Animated.spring(scale, { toValue: ZOOM_SCALE, useNativeDriver: true, friction: 8 }).start();
  }, [scale]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      // Double tap detected — toggle zoom.
      if (scaleValue.current > 1) {
        resetZoom();
      } else {
        zoomIn();
      }
      lastTapAt.current = 0;
    } else {
      lastTapAt.current = now;
    }
  }, [resetZoom, zoomIn]);

  const panStart = useRef({ x: 0, y: 0 });
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only intercept gestures when we're zoomed in. When zoom == 1 we let
        // the parent FlatList own horizontal swipes (page flip).
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g: PanResponderGestureState) =>
          scaleValue.current > 1 &&
          (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          scaleValue.current > 1 &&
          (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
        onPanResponderGrant: () => {
          panStart.current = {
            x: translateXValue.current,
            y: translateYValue.current,
          };
        },
        onPanResponderMove: (_e, g) => {
          // Clamp pan so the photo doesn't drift off-screen completely.
          const maxX = (width * (scaleValue.current - 1)) / 2;
          const maxY = (height * (scaleValue.current - 1)) / 2;
          const nx = clamp(panStart.current.x + g.dx, -maxX, maxX);
          const ny = clamp(panStart.current.y + g.dy, -maxY, maxY);
          translateX.setValue(nx);
          translateY.setValue(ny);
        },
        onPanResponderRelease: () => {
          // Spring back into bounds (in case clamp let the drag run a hair over).
          const maxX = (width * (scaleValue.current - 1)) / 2;
          const maxY = (height * (scaleValue.current - 1)) / 2;
          const nx = clamp(translateXValue.current, -maxX, maxX);
          const ny = clamp(translateYValue.current, -maxY, maxY);
          Animated.parallel([
            Animated.spring(translateX, { toValue: nx, useNativeDriver: true, friction: 8 }),
            Animated.spring(translateY, { toValue: ny, useNativeDriver: true, friction: 8 }),
          ]).start();
        },
      }),
    [height, translateX, translateY, width],
  );

  const onTouchEnd = (e: GestureResponderEvent) => {
    // Treat a touch with no significant movement as a tap.
    if (Math.abs(e.nativeEvent.locationX) > 0) handleTap();
  };

  return (
    <View
      style={[styles.page, { width, height }]}
      {...responder.panHandlers}
      onStartShouldSetResponder={() => true}
      onResponderRelease={onTouchEnd}
    >
      <Animated.View
        style={{
          width,
          height,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [
            { translateX },
            { translateY },
            { scale },
          ],
        }}
      >
        <Image
          source={{ uri: resolvePhotoUri(photo.storage_url) }}
          style={{ width: width - spacing['6'], height: height - spacing['12'] * 3 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessibilityLabel={photo.original_filename}
        />
      </Animated.View>
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080A08',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing['4'],
    paddingBottom: spacing['6'],
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing['3'],
  },
  filename: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  counter: {
    marginTop: spacing['2'],
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    lineHeight: 16,
  },
  errorPill: {
    marginTop: spacing['3'],
    alignSelf: 'flex-start',
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
    borderRadius: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    color: colors['safety-red-light'],
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  footerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['10'],
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing['3'],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing['2'],
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  iconButtonDanger: {
    borderColor: 'rgba(216, 170, 162, 0.5)',
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  tagColumn: {
    maxWidth: '60%',
    alignItems: 'flex-end',
    gap: spacing['1'],
  },
  tagChip: {
    paddingHorizontal: spacing['2'],
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  tagText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
});
