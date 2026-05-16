// Records screen — entry point for the 4 育儿事件 kinds + reverse-chronological list.
//
// Two halves stacked vertically: a row of "+喂奶 / +身高 / +体重 / +照片" buttons
// that open a modal form for the chosen kind, and a FlatList of all recent
// entries from the unified `/records/timeline` query (server-merged client-
// side from feeding + growth + album).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getApiBaseUrl } from '../lib/api';
import {
  createFeeding,
  createGrowth,
  recordQueries,
  uploadPhoto,
  type FeedingRecord,
  type GrowthRecord,
  type PhotoRecord,
  type RecordEntry,
} from '../shared/api';

type Kind = 'feeding' | 'weight' | 'height' | 'photo';

const KIND_META: Record<Kind, { label: string; emoji: string; color: string }> = {
  feeding: { label: '喂奶', emoji: '🍼', color: '#2c7a4b' },
  weight: { label: '体重', emoji: '⚖️', color: '#4a6da7' },
  height: { label: '身高', emoji: '📏', color: '#a76a4a' },
  photo: { label: '照片', emoji: '📷', color: '#b03070' },
};

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
  const [activeKind, setActiveKind] = useState<Kind | null>(null);

  const entries = data ?? [];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: recordQueries.timeline().queryKey });
  };

  if (isPending && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c7a4b" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>记录</Text>
        <Text style={styles.subtitle}>育儿事件 · 倒序展示</Text>
      </View>

      <View style={styles.actions}>
        {(Object.keys(KIND_META) as Kind[]).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.actionButton, { borderColor: KIND_META[k].color }]}
            onPress={() => setActiveKind(k)}
            accessibilityRole="button"
            accessibilityLabel={`新增${KIND_META[k].label}`}
          >
            <Text style={styles.actionEmoji}>{KIND_META[k].emoji}</Text>
            <Text style={[styles.actionLabel, { color: KIND_META[k].color }]}>
              +{KIND_META[k].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            离线 / 拉取失败，显示的是缓存数据。{'\n'}
            {(error as Error)?.message ?? ''}
          </Text>
        </View>
      )}

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecordRow entry={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>还没有记录。点击上方按钮录入第一条。</Text>
        }
      />

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

// ----- Row renderer -----

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
    // storage_url is a presigned URL from the backend; render directly.
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
      <View style={[styles.rowIcon, { backgroundColor: meta.color }]}>
        <Text style={styles.rowIconText}>{meta.emoji}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowKind}>{meta.label}</Text>
        {body}
        <Text style={styles.rowWhen}>{when}</Text>
      </View>
    </View>
  );
}

// ----- Form -----

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
            {(['breast', 'formula', 'solid'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.segment, feedType === t && styles.segmentActive]}
                onPress={() => setFeedType(t)}
              >
                <Text
                  style={[styles.segmentText, feedType === t && styles.segmentTextActive]}
                >
                  {t === 'breast' ? '母乳' : t === 'formula' ? '配方奶' : '辅食'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>奶量 (ml，可选)</Text>
          <TextInput
            style={styles.input}
            value={amountMl}
            onChangeText={setAmountMl}
            keyboardType="numeric"
            placeholder="120"
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>时长 (分钟，可选)</Text>
          <TextInput
            style={styles.input}
            value={durationMin}
            onChangeText={setDurationMin}
            keyboardType="numeric"
            placeholder="15"
            placeholderTextColor="#aaa"
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
            placeholderTextColor="#aaa"
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
            placeholderTextColor="#aaa"
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
            placeholderTextColor="#aaa"
            multiline
          />
        </>
      )}

      <View style={styles.formActions}>
        <TouchableOpacity
          style={[styles.formButton, styles.formButtonSecondary]}
          onPress={onCancel}
          disabled={mutation.isPending}
        >
          <Text style={styles.formButtonSecondaryText}>取消</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.formButton, mutation.isPending && styles.buttonDisabled]}
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          <Text style={styles.formButtonText}>
            {mutation.isPending ? '保存中…' : kind === 'photo' ? '选择照片' : '保存'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: { paddingTop: 56, paddingHorizontal: 24, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#222' },
  subtitle: { fontSize: 13, color: '#777', marginTop: 4 },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  actionEmoji: { fontSize: 22 },
  actionLabel: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff4e0',
    borderColor: '#e0a96d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  bannerText: { color: '#8a5a17', fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  empty: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 48 },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    alignItems: 'flex-start',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowIconText: { fontSize: 18 },
  rowMain: { flex: 1 },
  rowKind: { fontSize: 13, color: '#888', fontWeight: '600' },
  rowBody: { fontSize: 15, color: '#222', marginTop: 2 },
  rowWhen: { fontSize: 12, color: '#999', marginTop: 4 },
  thumb: { width: 120, height: 120, borderRadius: 8, marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12 },
  label: { fontSize: 13, color: '#555', marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fff',
  },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  hint: { fontSize: 14, color: '#666', marginTop: 12 },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  segmentActive: { backgroundColor: '#2c7a4b', borderColor: '#2c7a4b' },
  segmentText: { color: '#555', fontSize: 14 },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  formButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2c7a4b',
    alignItems: 'center',
  },
  formButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  formButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  formButtonSecondaryText: { color: '#555', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
});
