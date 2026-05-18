// Records screen — entry point for the 4 育儿事件 kinds + reverse-chronological list.
//
// Visual contract: every color / radius / spacing / shadow / type style comes
// from `mobile/src/shared/theme.ts`. No literal hex / px values are allowed in
// this file — that keeps the Android UI aligned with Web (Tailwind tokens) and
// makes future re-skins a one-token change.
//
// Layout (top → bottom):
//   • TopBar "记录"
//   • Intro section (subtitle copy mirroring Web)
//   • 4-up action cards (喂奶 / 身高 / 体重 / 照片) — each opens a modal form
//   • FlatList of all recent entries from the unified `/records/timeline` query

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import { GrowthHistoryList } from '../components/dashboard/GrowthHistoryList';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { TopBar } from '../components/layout/TopBar';
import { getApiBaseUrl } from '../lib/api';
import {
  createFeeding,
  createGrowth,
  growthQueries,
  recordQueries,
  uploadPhoto,
  type FeedingRecord,
  type GrowthRecord,
  type PhotoRecord,
  type RecordEntry,
} from '../shared/api';
import {
  borderWidth,
  colors,
  layout,
  opacity,
  radii,
  shadows,
  spacing,
  typography,
  type ColorToken,
} from '../shared/theme';

type Kind = 'feeding' | 'weight' | 'height' | 'photo';

/**
 * Per-kind visual metadata. `tintBg` / `tintFg` mirror the Web tinted-icon
 * pattern (e.g. `bg-nursery-butter text-warning-amber`). All values are theme
 * tokens so re-skinning is a single edit in `theme.ts`.
 */
const KIND_META: Record<
  Kind,
  { label: string; emoji: string; tintBg: ColorToken; tintFg: ColorToken }
> = {
  feeding: {
    label: '喂奶',
    emoji: '🍼',
    tintBg: 'nursery-butter',
    tintFg: 'warning-amber',
  },
  height: {
    label: '身高',
    emoji: '📏',
    tintBg: 'nursery-mint',
    tintFg: 'brand-strong',
  },
  weight: {
    label: '体重',
    emoji: '⚖️',
    tintBg: 'nursery-powder',
    tintFg: 'info-blue',
  },
  photo: {
    label: '照片',
    emoji: '📷',
    tintBg: 'safety-red-light',
    tintFg: 'safety-red',
  },
};

const KIND_ORDER: Kind[] = ['feeding', 'height', 'weight', 'photo'];

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function RecordsScreen() {
  const queryClient = useQueryClient();
  const { data, isPending, isFetching, isError, error, refetch } = useQuery(
    recordQueries.timeline(),
  );
  const { data: growthRecords } = useQuery(growthQueries.records());
  const [activeKind, setActiveKind] = useState<Kind | null>(null);

  const entries = data ?? [];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: recordQueries.timeline().queryKey });
    await queryClient.invalidateQueries({ queryKey: growthQueries.records().queryKey });
  };

  return (
    <View style={styles.root}>
      <TopBar title="记录" />

      {isPending && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors['fawn-amber']} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RecordRow entry={item} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Text style={styles.subtitle}>育儿事件 · 倒序展示</Text>

              <View style={styles.actions}>
                {KIND_ORDER.map((k) => {
                  const meta = KIND_META[k];
                  return (
                    <Pressable
                      key={k}
                      style={({ pressed }) => [
                        styles.actionCard,
                        pressed && styles.actionCardPressed,
                      ]}
                      onPress={() => setActiveKind(k)}
                      accessibilityRole="button"
                      accessibilityLabel={`新增${meta.label}`}
                    >
                      <View
                        style={[
                          styles.actionIcon,
                          { backgroundColor: colors[meta.tintBg] },
                        ]}
                      >
                        <Text style={styles.actionEmoji}>{meta.emoji}</Text>
                      </View>
                      <Text style={styles.actionLabel}>+{meta.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {isError ? (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>
                    离线 / 拉取失败，显示的是缓存数据。{'\n'}
                    {(error as Error)?.message ?? ''}
                  </Text>
                </View>
              ) : null}

              {/* Growth history — low-frequency explainer + sorted list of past measurements */}
              <View style={styles.growthSection}>
                <Text style={styles.growthExplainer}>
                  成长指标无需每日测量，按医生建议或自身节奏记录即可。
                </Text>
                <Text style={styles.growthHeading}>成长记录历史</Text>
                <GrowthHistoryList records={growthRecords ?? []} />
              </View>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={() => refetch()}
              tintColor={colors['fawn-amber']}
              colors={[colors['fawn-amber']]}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>还没有记录。点击上方按钮录入第一条。</Text>
          }
        />
      )}

      <Modal
        visible={activeKind !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveKind(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {activeKind && (
              <RecordForm
                kind={activeKind}
                onCancel={() => setActiveKind(null)}
                onSubmitted={async () => {
                  setActiveKind(null);
                  await invalidate();
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ----- Row renderer --------------------------------------------------------

function RecordRow({ entry }: { entry: RecordEntry }) {
  const meta = KIND_META[entry.kind];
  const baseUrl = getApiBaseUrl();
  let when = '';
  let body: React.ReactNode = null;

  if (entry.kind === 'feeding') {
    const r: FeedingRecord = entry.record;
    when = formatTime(r.feed_time);
    const parts: string[] = [];
    const typeLabel = { breast: '母乳', formula: '配方奶', solid: '辅食' }[r.feed_type];
    parts.push(typeLabel);
    if (r.amount_ml != null) parts.push(`${r.amount_ml} ml`);
    if (r.duration_min != null) parts.push(`${r.duration_min} 分钟`);
    body = <Text style={styles.rowBody}>{parts.join(' · ')}</Text>;
  } else if (entry.kind === 'weight') {
    const r: GrowthRecord = entry.record;
    when = r.measurement_date;
    body = <Text style={styles.rowBody}>{r.weight_g} g</Text>;
  } else if (entry.kind === 'height') {
    const r: GrowthRecord = entry.record;
    when = r.measurement_date;
    body = <Text style={styles.rowBody}>{r.height_cm} cm</Text>;
  } else {
    const r: PhotoRecord = entry.record;
    when = formatTime(r.taken_at ?? r.uploaded_at);
    const uri = r.storage_url.startsWith('http')
      ? r.storage_url
      : `${baseUrl}${r.storage_url}`;
    body = (
      <ExpoImage
        source={{ uri }}
        style={styles.thumb}
        contentFit="cover"
        cachePolicy="memory-disk"
        accessibilityLabel="照片"
      />
    );
  }

  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: colors[meta.tintBg] }]}>
        <Text style={styles.rowIconText}>{meta.emoji}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowKind, { color: colors[meta.tintFg] }]}>{meta.label}</Text>
        {body}
        <Text style={styles.rowWhen}>{when}</Text>
      </View>
    </View>
  );
}

// ----- Form ----------------------------------------------------------------

interface FormProps {
  kind: Kind;
  onCancel: () => void;
  onSubmitted: () => void | Promise<void>;
}

function RecordForm({ kind, onCancel, onSubmitted }: FormProps) {
  const [feedType, setFeedType] = useState<'breast' | 'formula' | 'solid'>('breast');
  const [amountMl, setAmountMl] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [weightG, setWeightG] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [notes, setNotes] = useState('');

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const nowIso = useMemo(() => new Date().toISOString(), []);

  const mutation = useMutation({
    mutationFn: async () => {
      if (kind === 'feeding') {
        const amt = amountMl.trim() ? Number(amountMl) : null;
        const dur = durationMin.trim() ? Number(durationMin) : null;
        if (amt !== null && (!Number.isFinite(amt) || amt <= 0)) throw new Error('奶量需为正数');
        if (dur !== null && (!Number.isFinite(dur) || dur <= 0)) throw new Error('时长需为正数');
        await createFeeding({
          feed_time: nowIso,
          feed_type: feedType,
          amount_ml: amt,
          duration_min: dur,
          notes: notes.trim() || null,
        });
        return;
      }
      if (kind === 'weight') {
        const w = Number(weightG);
        if (!Number.isFinite(w) || w <= 0) throw new Error('体重需为正数 (g)');
        await createGrowth({
          measurement_date: today,
          weight_g: w,
          notes: notes.trim() || null,
        });
        return;
      }
      if (kind === 'height') {
        const h = Number(heightCm);
        if (!Number.isFinite(h) || h <= 0) throw new Error('身高需为正数 (cm)');
        await createGrowth({
          measurement_date: today,
          height_cm: h,
          notes: notes.trim() || null,
        });
        return;
      }
      // photo
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error('需要相册权限');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (result.canceled || result.assets.length === 0) throw new Error('已取消');
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const filename = asset.fileName ?? `upload-${Date.now()}.jpg`;
      await uploadPhoto(asset.uri, mimeType, filename);
    },
    onSuccess: () => {
      void onSubmitted();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === '已取消') {
        onCancel();
        return;
      }
      Alert.alert('保存失败', msg);
    },
  });

  return (
    <View>
      <Text style={styles.formTitle}>
        {KIND_META[kind].emoji} 新增{KIND_META[kind].label}
      </Text>

      {kind === 'feeding' && (
        <>
          <Text style={styles.label}>类型</Text>
          <View style={styles.segmented}>
            {(['breast', 'formula', 'solid'] as const).map((t) => {
              const active = feedType === t;
              return (
                <Pressable
                  key={t}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setFeedType(t)}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {t === 'breast' ? '母乳' : t === 'formula' ? '配方奶' : '辅食'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>奶量 (ml，可选)</Text>
          <TextInput
            style={styles.input}
            value={amountMl}
            onChangeText={setAmountMl}
            keyboardType="numeric"
            placeholder="120"
            placeholderTextColor={colors['mid-gray']}
          />

          <Text style={styles.label}>时长 (分钟，可选)</Text>
          <TextInput
            style={styles.input}
            value={durationMin}
            onChangeText={setDurationMin}
            keyboardType="numeric"
            placeholder="15"
            placeholderTextColor={colors['mid-gray']}
          />
        </>
      )}

      {kind === 'weight' && (
        <>
          <Text style={styles.label}>体重 (g)</Text>
          <TextInput
            style={styles.input}
            value={weightG}
            onChangeText={setWeightG}
            keyboardType="numeric"
            placeholder="6500"
            placeholderTextColor={colors['mid-gray']}
          />
        </>
      )}

      {kind === 'height' && (
        <>
          <Text style={styles.label}>身高 (cm)</Text>
          <TextInput
            style={styles.input}
            value={heightCm}
            onChangeText={setHeightCm}
            keyboardType="numeric"
            placeholder="62.5"
            placeholderTextColor={colors['mid-gray']}
          />
        </>
      )}

      {kind === 'photo' && (
        <Text style={styles.hint}>点击「选择照片」从相册中选取并上传。</Text>
      )}

      {kind !== 'photo' && (
        <>
          <Text style={styles.label}>备注 (可选)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="额外信息"
            placeholderTextColor={colors['mid-gray']}
            multiline
          />
        </>
      )}

      <View style={styles.formActions}>
        <Pressable
          style={[styles.formButton, styles.formButtonSecondary]}
          onPress={onCancel}
          disabled={mutation.isPending}
        >
          <Text style={styles.formButtonSecondaryText}>取消</Text>
        </Pressable>
        <Pressable
          style={[
            styles.formButton,
            styles.formButtonPrimary,
            mutation.isPending && styles.buttonDisabled,
          ]}
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          <Text style={styles.formButtonText}>
            {mutation.isPending ? '保存中…' : kind === 'photo' ? '选择照片' : '保存'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — every value is a `theme.ts` token. Search for a literal hex / px
// here should return zero hits.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors['warm-cream'],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- List header (subtitle + action grid + offline banner) -------------
  headerBlock: {
    paddingTop: spacing['3'],
    paddingBottom: spacing['4'],
    gap: spacing['4'],
  },
  subtitle: {
    ...typography.bodySmall,
    paddingHorizontal: spacing['4'],
  },

  // --- 4-up action cards --------------------------------------------------
  actions: {
    flexDirection: 'row',
    paddingHorizontal: spacing['4'],
    gap: spacing['2'],
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors['card'],
    borderRadius: radii.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    paddingVertical: spacing['3'],
    paddingHorizontal: spacing['2'],
    alignItems: 'center',
    gap: spacing['1'],
    ...shadows.card,
  },
  actionCardPressed: {
    opacity: opacity.pressed,
  },
  actionIcon: {
    width: layout.tintedIconSm,
    height: layout.tintedIconSm,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionEmoji: {
    fontSize: typography.heading.fontSize,
  },
  actionLabel: {
    ...typography.tabLabel,
    color: colors['soft-charcoal'],
  },

  // --- Offline banner -----------------------------------------------------
  banner: {
    marginHorizontal: spacing['4'],
    backgroundColor: colors['warning-amber-light'],
    borderColor: colors['warning-amber'],
    borderWidth: borderWidth.hairline,
    borderRadius: radii.md,
    padding: spacing['3'],
  },
  bannerText: {
    ...typography.bodySmall,
    color: colors['warning-amber'],
  },

  // --- Growth history section ---------------------------------------------
  growthSection: {
    gap: spacing['2'],
  },
  growthExplainer: {
    ...typography.caption,
    color: colors['dark-gray'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.md,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  growthHeading: {
    fontSize: 15,
    fontFamily: typography.heading.fontFamily,
    color: colors['soft-charcoal'],
  },

  // --- Timeline list ------------------------------------------------------
  listContent: {
    paddingHorizontal: spacing['4'],
    paddingBottom: layout.tabbarHeight + spacing['6'],
    flexGrow: 1,
  },
  empty: {
    ...typography.body,
    color: colors['mid-gray'],
    textAlign: 'center',
    marginTop: spacing['12'],
  },
  separator: {
    height: spacing['2'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors['card'],
    borderRadius: radii.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    padding: spacing['3'],
    gap: spacing['3'],
    ...shadows.card,
  },
  rowIcon: {
    width: layout.tintedIconMd,
    height: layout.tintedIconMd,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconText: {
    fontSize: typography.heading.fontSize,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowKind: {
    ...typography.caption,
    fontFamily: typography.tabLabel.fontFamily,
  },
  rowBody: {
    ...typography.body,
    marginTop: spacing['1'],
  },
  rowWhen: {
    ...typography.caption,
    marginTop: spacing['1'],
  },
  thumb: {
    width: layout.thumb,
    height: layout.thumb,
    borderRadius: radii.md,
    marginTop: spacing['1'],
  },

  // --- Modal form ---------------------------------------------------------
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors['modal-backdrop'],
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors['card'],
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing['5'],
    paddingBottom: spacing['8'],
    ...shadows.modal,
  },
  formTitle: {
    ...typography.heading,
    marginBottom: spacing['3'],
  },
  label: {
    ...typography.bodySmall,
    marginTop: spacing['3'],
    marginBottom: spacing['2'],
  },
  input: {
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
    borderRadius: radii.md,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['3'],
    backgroundColor: colors['card'],
    ...typography.body,
  },
  inputMultiline: {
    minHeight: layout.inputMultilineMinHeight,
    textAlignVertical: 'top',
  },
  hint: {
    ...typography.bodySmall,
    marginTop: spacing['3'],
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing['2'],
    backgroundColor: colors['warm-gray'],
    borderRadius: radii.md,
    padding: spacing['1'],
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
  },
  segment: {
    flex: 1,
    paddingVertical: spacing['2'],
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors['card'],
    ...shadows.card,
  },
  segmentText: {
    ...typography.bodySmall,
    color: colors['dark-gray'],
  },
  segmentTextActive: {
    ...typography.button,
    color: colors['fawn-amber'],
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing['3'],
    marginTop: spacing['5'],
  },
  formButton: {
    flex: 1,
    paddingVertical: spacing['3'],
    borderRadius: radii.input,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.iconButton,
  },
  formButtonPrimary: {
    backgroundColor: colors['fawn-amber'],
  },
  formButtonText: {
    ...typography.button,
    color: colors['card'],
  },
  formButtonSecondary: {
    backgroundColor: colors['card'],
    borderWidth: borderWidth.hairline,
    borderColor: colors['oat-border'],
  },
  formButtonSecondaryText: {
    ...typography.button,
    color: colors['dark-gray'],
  },
  buttonDisabled: {
    opacity: opacity.disabled,
  },
});
