// Records (育儿事件) API layer.
//
// Surfaces the four event kinds shown in the Records screen — feeding, weight,
// height, and photo — on top of the existing `/tracker/*` and `/album/photos`
// endpoints. The list query merges all four kinds and sorts client-side so the
// screen can render a single reverse-chronological timeline.

import { api } from './client';
import { queryKeys } from './queryKeys';
import type {
  FeedingRecord,
  GrowthRecord,
  PhotoRecord,
  RecordEntry,
} from './types';

// ---------- Feeding ----------

export interface FeedingCreateInput {
  feed_time: string; // ISO datetime
  feed_type: 'breast' | 'formula' | 'solid';
  amount_ml?: number | null;
  duration_min?: number | null;
  notes?: string | null;
}

async function fetchFeeding(): Promise<FeedingRecord[]> {
  const { data } = await api.get<FeedingRecord[]>('/tracker/feeding', {
    params: { limit: 100 },
  });
  return data;
}

export async function createFeeding(input: FeedingCreateInput): Promise<FeedingRecord> {
  const { data } = await api.post<FeedingRecord>('/tracker/feeding', input);
  return data;
}

// ---------- Growth (weight + height share one endpoint) ----------

export interface GrowthCreateInput {
  measurement_date: string; // YYYY-MM-DD
  weight_g?: number | null;
  height_cm?: number | null;
  head_cm?: number | null;
  notes?: string | null;
}

async function fetchGrowth(): Promise<GrowthRecord[]> {
  const { data } = await api.get<GrowthRecord[]>('/tracker/growth', {
    params: { limit: 100 },
  });
  return data;
}

export async function createGrowth(input: GrowthCreateInput): Promise<GrowthRecord> {
  const { data } = await api.post<GrowthRecord>('/tracker/growth', input);
  return data;
}

// ---------- Photo (album) ----------

interface PaginatedPhotos {
  items: PhotoRecord[];
  total: number;
  page: number;
  page_size: number;
}

async function fetchPhotos(): Promise<PhotoRecord[]> {
  const { data } = await api.get<PaginatedPhotos>('/album/photos', {
    params: { view: 'timeline', page: 1, page_size: 50 },
  });
  return data.items;
}

export async function uploadPhoto(
  uri: string,
  mimeType: string,
  filename: string,
): Promise<PhotoRecord> {
  const form = new FormData();
  form.append('file', { uri, type: mimeType, name: filename } as unknown as Blob);
  const { data } = await api.post<PhotoRecord>('/album/photos', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ---------- Unified timeline ----------

/** Pick the timestamp we sort the unified timeline by. */
function timelineTime(entry: RecordEntry): number {
  switch (entry.kind) {
    case 'feeding':
      return new Date(entry.record.feed_time).getTime();
    case 'weight':
    case 'height':
      // Growth records only have a date; sort by end-of-day so they slot in
      // after same-day feedings that may have been recorded with a time.
      return new Date(`${entry.record.measurement_date}T23:59:59`).getTime();
    case 'photo':
      return new Date(entry.record.taken_at ?? entry.record.uploaded_at).getTime();
  }
}

/**
 * Pull all four event sources in parallel and fold them into a single
 * reverse-chronological list. We split growth rows into separate weight/height
 * entries so the UI can render each measurement as its own card — a growth row
 * without weight_g is just a height entry (and vice versa). Rows with neither
 * are dropped since the create form requires at least one of the two.
 */
async function fetchTimeline(): Promise<RecordEntry[]> {
  const [feeding, growth, photos] = await Promise.all([
    fetchFeeding(),
    fetchGrowth(),
    fetchPhotos(),
  ]);

  const entries: RecordEntry[] = [];
  for (const r of feeding) entries.push({ kind: 'feeding', id: `feeding:${r.id}`, record: r });
  for (const r of growth) {
    if (r.weight_g != null) entries.push({ kind: 'weight', id: `weight:${r.id}`, record: r });
    if (r.height_cm != null) entries.push({ kind: 'height', id: `height:${r.id}`, record: r });
  }
  for (const r of photos) entries.push({ kind: 'photo', id: `photo:${r.id}`, record: r });

  entries.sort((a, b) => timelineTime(b) - timelineTime(a));
  return entries;
}

export const recordQueries = {
  timeline: () => ({
    queryKey: queryKeys.records.timeline(),
    queryFn: fetchTimeline,
  }),
};
