// Album upload button — mirrors `frontend/src/components/album/UploadButton.tsx`.
//
// On Android we offer two sources via an action sheet:
//   1. 拍照 → opens the camera (requires camera permission)
//   2. 从相册选取 → opens the photo library (requires media-library permission)
//
// The actual upload is delegated to the parent (it owns the API call /
// invalidation); this component just picks a local asset and hands it back.

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radii, shadows, spacing, typography } from '../../shared/theme';

export interface PickedAsset {
  uri: string;
  mimeType: string;
  filename: string;
  takenAt?: string;
}

interface UploadButtonProps {
  onPicked: (asset: PickedAsset) => Promise<void> | void;
  isUploading: boolean;
}

function normalizeExifOffset(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = /^([+-])(\d{2}):?(\d{2})?$/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}${match[2]}:${match[3] ?? '00'}`;
}

function parseExifDateTime(value: unknown, offset: string | null): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const exifMatch =
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (exifMatch) {
    const [, year, month, day, hour, minute, second] = exifMatch;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset ?? '+08:00'}`;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractTakenAt(exif: Record<string, unknown> | null | undefined): string | undefined {
  if (!exif) return undefined;
  const offset =
    normalizeExifOffset(exif.OffsetTimeOriginal) ??
    normalizeExifOffset(exif.OffsetTimeDigitized) ??
    normalizeExifOffset(exif.OffsetTime);
  const takenAt =
    parseExifDateTime(exif.DateTimeOriginal, offset) ??
    parseExifDateTime(exif.DateTimeDigitized, offset) ??
    parseExifDateTime(exif.DateTime, offset);
  return takenAt ?? undefined;
}

function assetFromPickerResult(
  result: ImagePicker.ImagePickerResult,
): PickedAsset | null {
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const filename = asset.fileName ?? `photo-${Date.now()}.jpg`;
  return { uri: asset.uri, mimeType, filename, takenAt: extractTakenAt(asset.exif) };
}

async function pickFromLibrary(): Promise<PickedAsset | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('需要相册权限', '请在系统设置中授予访问相册的权限。');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    exif: true,
  });
  return assetFromPickerResult(result);
}

async function pickFromCamera(): Promise<PickedAsset | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('需要相机权限', '请在系统设置中授予访问相机的权限。');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    exif: true,
  });
  return assetFromPickerResult(result);
}

export function UploadButton({ onPicked, isUploading }: UploadButtonProps) {
  const insets = useSafeAreaInsets();

  const openSheet = useCallback(() => {
    if (isUploading) return;

    const handle = async (source: 'camera' | 'library') => {
      try {
        const asset =
          source === 'camera' ? await pickFromCamera() : await pickFromLibrary();
        if (asset) await onPicked(asset);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert('选择照片失败', msg);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['取消', '拍照', '从相册选取'],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) void handle('camera');
          else if (idx === 2) void handle('library');
        },
      );
      return;
    }

    Alert.alert('上传照片', undefined, [
      { text: '取消', style: 'cancel' },
      { text: '拍照', onPress: () => void handle('camera') },
      { text: '从相册选取', onPress: () => void handle('library') },
    ]);
  }, [isUploading, onPicked]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        // Float above the bottom system inset. No bottom tab bar anymore
        // (drawer replaces it), so spacing['6'] is enough clearance.
        { bottom: insets.bottom + spacing['6'] },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="上传照片"
        disabled={isUploading}
        onPress={openSheet}
        style={({ pressed }) => [
          styles.button,
          pressed && !isUploading && styles.buttonPressed,
          isUploading && styles.buttonDisabled,
        ]}
      >
        {isUploading ? (
          <ActivityIndicator color={colors['white']} size="small" />
        ) : (
          <Ionicons name="cloud-upload-outline" size={20} color={colors['white']} />
        )}
        <Text style={[typography.button, styles.label]}>
          {isUploading ? '上传中…' : '上传'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: spacing['4'],
    alignItems: 'flex-end',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
    paddingHorizontal: spacing['5'],
    height: layout.fabHeight,
    borderRadius: radii.input,
    backgroundColor: colors['fawn-amber'],
    ...shadows.float,
  },
  buttonPressed: {
    backgroundColor: colors['brand-strong'],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  label: {
    color: colors['white'],
  },
});
