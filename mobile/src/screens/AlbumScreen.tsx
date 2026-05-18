// Album tab screen — mirrors `frontend/src/app/(main)/album/page.tsx`.
//
// Top of the page hosts a mode switcher (时间线 / 场景 / 里程碑) that drives the
// `view` parameter on the photo list query. Below it sits the photo grid. A
// floating upload button hovers above the bottom TabBar; tapping it triggers
// the camera / library picker and uploads via the album API. Tapping a tile
// opens the full-screen viewer with swipe / zoom gestures.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  PhotoGrid,
  type AlbumView,
} from '../components/album/PhotoGrid';
import { PhotoViewer } from '../components/album/PhotoViewer';
import { UploadButton, type PickedAsset } from '../components/album/UploadButton';
import {
  albumQueries,
  deletePhoto,
  getPhotoDownloadUrl,
  uploadAlbumPhoto,
  type PhotoRecord,
} from '../shared/api';
import { getUser } from '../lib/tokenStorage';
import { colors, layout, radii, shadows, spacing, typography } from '../shared/theme';

const MODES: ReadonlyArray<{ value: AlbumView; label: string }> = [
  { value: 'timeline', label: '时间线' },
  { value: 'scene', label: '场景' },
  { value: 'milestone', label: '里程碑' },
];

export function AlbumScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [view, setView] = useState<AlbumView>('timeline');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Cached permission flags from the active account; fetched once on mount.
  const [perms, setPerms] = useState<{ canUpload: boolean; canDelete: boolean }>({
    canUpload: false,
    canDelete: false,
  });

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await getUser();
      if (cancelled) return;
      const permissions = user?.permissions ?? {};
      // Mirror the Web flags from `canUploadPhotos` / `canSoftDeleteData`:
      // friends (read-only) cannot upload or delete; everyone else can.
      const isFriend = user?.access_type === 'friend';
      setPerms({
        canUpload: permissions.can_upload_photos ?? !isFriend,
        canDelete: permissions.can_soft_delete ?? !isFriend,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { data, isPending, isFetching, isError, error, refetch } = useQuery(
    albumQueries.photos(view),
  );

  const photos = data ?? [];
  const selected = useMemo(
    () => (selectedId ? photos.find((p) => p.id === selectedId) ?? null : null),
    [photos, selectedId],
  );

  const invalidate = useCallback(async () => {
    // Invalidate every view so a freshly uploaded / deleted photo is
    // reflected when the user switches modes.
    await queryClient.invalidateQueries({ queryKey: ['album', 'photos'] });
  }, [queryClient]);

  const uploadMutation = useMutation({
    mutationFn: (asset: PickedAsset) =>
      uploadAlbumPhoto(asset.uri, asset.mimeType, asset.filename),
    onSuccess: () => {
      void invalidate();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('上传失败', msg);
    },
  });

  const handlePicked = useCallback(
    async (asset: PickedAsset) => {
      await uploadMutation.mutateAsync(asset);
    },
    [uploadMutation],
  );

  const handleDownload = useCallback(async (photo: PhotoRecord) => {
    const { download_url } = await getPhotoDownloadUrl(photo.id);
    // Hand the presigned URL off to the OS — the system browser / download
    // manager handles saving to the device. RN doesn't ship a first-party
    // file-download API and we don't want to take on a new dep just for this.
    const canOpen = await Linking.canOpenURL(download_url);
    if (!canOpen) throw new Error('无法打开下载链接');
    await Linking.openURL(download_url);
  }, []);

  const handleDelete = useCallback(
    async (photo: PhotoRecord) => {
      await deletePhoto(photo.id);
      setSelectedId(null);
      await invalidate();
    },
    [invalidate],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isPending} onRefresh={() => refetch()} />
        }
      >
        <View style={styles.modeCard}>
          <View style={styles.modeCardHeader}>
            <View style={styles.modeCardHeaderLeft}>
              <View style={styles.modeIcon}>
                <Ionicons name="images-outline" size={16} color={colors['brand-strong']} />
              </View>
              <Text style={[typography.caption, styles.modeHint]} numberOfLines={1}>
                按时间、场景和里程碑浏览
              </Text>
            </View>
            <View style={styles.countPill}>
              <Text style={[typography.caption, styles.countText]}>
                {isPending ? '加载中' : `${photos.length} 张`}
              </Text>
            </View>
          </View>
          <View style={styles.modeSwitcher}>
            {MODES.map((mode) => {
              const active = mode.value === view;
              return (
                <Pressable
                  key={mode.value}
                  accessibilityRole="button"
                  accessibilityState={active ? { selected: true } : {}}
                  accessibilityLabel={mode.label}
                  onPress={() => setView(mode.value)}
                  style={[styles.modeButton, active && styles.modeButtonActive]}
                >
                  <Text
                    style={[
                      typography.button,
                      styles.modeButtonText,
                      active && styles.modeButtonTextActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {isError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              照片加载失败，请稍后再试。
              {error instanceof Error ? `\n${error.message}` : ''}
            </Text>
          </View>
        ) : null}

        {isPending ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors['fawn-amber']} />
          </View>
        ) : (
          <PhotoGrid
            photos={photos}
            view={view}
            onPhotoPress={(photo) => setSelectedId(photo.id)}
          />
        )}
      </ScrollView>

      {perms.canUpload ? (
        <UploadButton onPicked={handlePicked} isUploading={uploadMutation.isPending} />
      ) : null}

      {selected ? (
        <PhotoViewer
          photos={photos}
          initialPhotoId={selected.id}
          onClose={() => setSelectedId(null)}
          onDownload={handleDownload}
          onDelete={perms.canDelete ? handleDelete : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  scrollContent: {
    paddingHorizontal: spacing['4'],
    paddingTop: spacing['4'],
    paddingBottom: layout.tabbarHeight + spacing['12'],
    gap: spacing['4'],
  },
  modeCard: {
    borderRadius: radii.tile,
    // Mirrors Web `bg-white/85` on the album mode card.
    backgroundColor: colors['white-soft'],
    borderWidth: 1,
    borderColor: colors['frosted-border'],
    padding: spacing['2'],
    gap: spacing['2'],
    ...shadows.card,
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['2'],
    paddingTop: spacing['1'],
  },
  modeCardHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    minWidth: 0,
  },
  modeIcon: {
    width: layout.badge,
    height: layout.badge,
    borderRadius: layout.badge / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors['nursery-mint'],
  },
  modeHint: {
    color: colors['mid-gray'],
    fontStyle: 'italic',
    flexShrink: 1,
  },
  countPill: {
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
    borderRadius: radii.chip,
    backgroundColor: colors['warm-gray'],
  },
  countText: {
    color: colors['dark-gray'],
    fontWeight: '600',
  },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.lg,
    padding: spacing['1'],
    gap: spacing['1'],
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  modeButtonActive: {
    backgroundColor: colors['card'],
    ...shadows.card,
  },
  modeButtonText: {
    color: colors['dark-gray'],
  },
  modeButtonTextActive: {
    color: colors['fawn-amber'],
  },
  errorBanner: {
    borderRadius: radii.lg,
    backgroundColor: colors['safety-red-light'],
    paddingHorizontal: spacing['4'],
    paddingVertical: spacing['3'],
  },
  errorText: {
    color: colors['safety-red'],
    fontSize: 13,
    lineHeight: 18,
  },
  loading: {
    paddingVertical: spacing['12'],
    alignItems: 'center',
  },
});
