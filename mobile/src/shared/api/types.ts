// Shared API DTOs. These mirror the FastAPI response schemas in
// backend/src/fawn/api/schemas.py and are the single source of truth for any
// feature code that talks to the backend.

import type { User } from '../../lib/types';

export type BabyGender = 'male' | 'female';

export interface Baby {
  id: string;
  name: string | null;
  gender: BabyGender | null;
  birth_date: string | null;
  birth_weight_g: number | null;
  birth_height_cm: number | null;
  birth_head_cm: number | null;
  is_premature: boolean;
  gestational_weeks: number | null;
}

// ---------- Chat ----------

export type MessageType = 'text' | 'image' | 'data_card' | 'safety_alert';

export type ChatMessageMetadata = {
  image_url?: string;
  [key: string]: unknown;
};

export interface ConversationSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  summary: string | null;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  sender?: User | null;
  role: 'user' | 'assistant';
  content: string;
  message_type: MessageType;
  metadata: ChatMessageMetadata | null;
  created_at: string;
}

export interface ConversationTargetMetadata {
  target_message_id: string | null;
  target_index: number | null;
  around_limit: number | null;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: ChatMessage[];
  has_more: boolean;
  next_before: string | null;
  target: ConversationTargetMetadata | null;
}

export interface ChatImageUploadResponse {
  image_url: string;
  mime_type: string;
}

export interface PaginatedConversations {
  items: ConversationSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChatMessageSearchResult extends ChatMessage {
  conversation_started_at: string;
}

export interface PaginatedChatMessageSearchResults {
  items: ChatMessageSearchResult[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChatMonthActivityDay {
  date: string; // YYYY-MM-DD in Asia/Shanghai
  day: number;
  message_count: number;
}

export interface ChatMonthActivityResponse {
  year: number;
  month: number;
  days: ChatMonthActivityDay[];
}

export interface ChatHistoryTarget {
  conversation_id: string;
  message_id: string;
  created_at: string;
  role: 'user' | 'assistant';
  content: string;
  message_type: MessageType;
  metadata: ChatMessageMetadata | null;
  sender_user_id: string | null;
  sender?: User | null;
}

export interface ChatDayTargetResponse {
  date: string; // YYYY-MM-DD in Asia/Shanghai
  target: ChatHistoryTarget | null;
}

export type SendChatMessageResult =
  | { type: 'sent' }
  | { type: 'session_expired'; expiredConversationId: string };

// ---------- Records (feeding / growth / album) ----------

export interface FeedingRecord {
  id: string;
  feed_time: string;
  feed_type: 'breast' | 'formula' | 'solid';
  amount_ml: number | null;
  duration_min: number | null;
  notes: string | null;
}

// ---------- Growth ----------

export interface GrowthRecord {
  id: string;
  measurement_date: string;
  weight_g: number | null;
  height_cm: number | null;
  head_cm: number | null;
  weight_percentile: number | null;
  height_percentile: number | null;
  head_percentile: number | null;
  notes: string | null;
}

export interface PhotoTag {
  id: string;
  tag_type: 'scene' | 'expression' | 'milestone';
  tag_value: string;
  confidence: number;
  is_confirmed: boolean;
}

export interface PhotoRecord {
  id: string;
  storage_url: string;
  original_filename: string;
  taken_at: string | null;
  uploaded_at: string;
  tags: PhotoTag[];
}

/**
 * One row in the unified records timeline. We split a growth row into separate
 * weight/height entries because the UI shows each measurement as its own card,
 * and timeline ordering wants the same `record + kind + id` shape across all
 * four event types.
 */
export type RecordEntry =
  | { kind: 'feeding'; id: string; record: FeedingRecord }
  | { kind: 'diaper'; id: string; record: DiaperRecord }
  | { kind: 'weight'; id: string; record: GrowthRecord }
  | { kind: 'height'; id: string; record: GrowthRecord }
  | { kind: 'photo'; id: string; record: PhotoRecord };

export interface GrowthChartRecord {
  date: string;
  weight_g: number | null;
  height_cm: number | null;
  head_cm: number | null;
}

export interface WHOReferencePoint {
  age_months: number;
  value: number;
}

export interface WHOReferenceLines {
  p3: WHOReferencePoint[];
  p15: WHOReferencePoint[];
  p50: WHOReferencePoint[];
  p85: WHOReferencePoint[];
  p97: WHOReferencePoint[];
}

export interface GrowthWHOReference {
  weight: WHOReferenceLines;
  height: WHOReferenceLines;
  head: WHOReferenceLines;
}

export interface GrowthChartData {
  records: GrowthChartRecord[];
  who_reference: GrowthWHOReference;
}

export interface DashboardLatestGrowthMetric {
  date: string;
  value: number;
  percentile: number | null;
}

export interface DashboardLatestGrowth {
  weight: DashboardLatestGrowthMetric | null;
  height: DashboardLatestGrowthMetric | null;
  head: DashboardLatestGrowthMetric | null;
}

// ---------- Dashboard summary / stats / health ----------

export interface SleepRecord {
  id: string;
  sleep_start: string;
  sleep_end: string | null;
  night_wakings: number;
  sleep_type: 'nap' | 'night';
  notes: string | null;
}

export type DiaperType = 'poop' | 'pee' | 'mixed';

export interface DiaperRecord {
  id: string;
  diaper_time: string;
  diaper_type: DiaperType;
  notes: string | null;
}

export interface HealthRecord {
  id: string;
  record_date: string;
  record_type: 'vaccination' | 'illness' | 'checkup';
  title: string;
  description: string | null;
}

export interface DashboardSummary {
  baby:
    | {
        name: string | null;
        gender: BabyGender | null;
        birth_date: string | null;
        age_days: number | null;
        age_display: string | null;
      }
    | null;
  latest_growth: DashboardLatestGrowth | null;
  today_feeding: {
    total_ml: number;
    breast_duration_min: number;
    count: number;
    last_feed_time: string | null;
  };
  today_sleep: {
    total_hours: number | null;
    night_wakings: number | null;
  };
}

export interface FeedingStatsDaily {
  date: string;
  total_ml: number;
  breast_duration_min: number;
  count: number;
}

export interface FeedingStatsData {
  days: number;
  daily: FeedingStatsDaily[];
  average_daily_ml: number;
  average_daily_breast_duration_min: number;
  average_daily_count: number;
}

export interface SleepStatsDaily {
  date: string;
  total_hours: number | null;
  night_wakings: number | null;
}

export interface SleepStatsData {
  days: number;
  daily: SleepStatsDaily[];
  average_daily_hours: number | null;
  average_night_wakings: number | null;
}

export interface DiaperStatsDaily {
  date: string;
  poop: number;
  pee: number;
  mixed: number;
  total: number;
}

export interface DiaperStatsData {
  days: number;
  daily: DiaperStatsDaily[];
  average_daily_poop: number;
  average_daily_pee: number;
  average_daily_mixed: number;
  average_daily_total: number;
}
