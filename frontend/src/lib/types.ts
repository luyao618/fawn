export type UserAccessType = 'parent' | 'family' | 'friend';

export interface UserPermissions {
  can_upload_photos: boolean;
  can_write_tracker: boolean;
}

export interface User {
  id: string;
  family_id: string;
  username: string;
  display_name: string;
  access_type: UserAccessType;
  role: string;
  avatar_url: string | null;
  permissions: UserPermissions;
}

export interface Family {
  id: string;
  name: string;
}

export interface UserCreate {
  username: string;
  display_name: string;
  password: string;
  access_type: UserAccessType;
  role: string;
}

export interface UserUpdate {
  display_name?: string;
  access_type?: UserAccessType;
  role?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface RegistrationRequest {
  invite_code: string;
  family_name: string;
  username: string;
  password: string;
  display_name: string;
  role: '爸爸' | '妈妈';
}

export interface RegistrationResponse {
  family: Family;
  user: User;
}

export interface Baby {
  id: string;
  name: string | null;
  gender: 'male' | 'female' | null;
  birth_date: string | null;
  birth_weight_g: number | null;
  birth_height_cm: number | null;
  birth_head_cm: number | null;
  is_premature: boolean;
  gestational_weeks: number | null;
}

export type MessageType = 'text' | 'image' | 'data_card' | 'safety_alert';

export interface Message {
  id: string;
  conversation_id: string;
  sender_user_id?: string | null;
  sender?: User | null;
  role: 'user' | 'assistant';
  content: string;
  message_type: MessageType;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  summary: string | null;
  message_count: number;
}

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: Record<string, unknown> }
  | { type: 'done'; message_id: string; message_type: MessageType }
  | { type: 'error'; message: string }
  | { type: 'session_expired'; expired_conversation_id: string };

export type TrackerType = 'growth' | 'feeding' | 'sleep' | 'health' | 'diaper';

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

export interface GrowthRecordCreate {
  measurement_date: string;
  weight_g?: number | null;
  height_cm?: number | null;
  head_cm?: number | null;
  notes?: string | null;
}

export interface GrowthReferenceP50 {
  measurement_date: string;
  age_days: number;
  age_display: string;
  weight_g: number | null;
  height_cm: number | null;
  head_cm: number | null;
}

export interface FeedingRecord {
  id: string;
  feed_time: string;
  feed_type: 'breast' | 'formula' | 'solid';
  amount_ml: number | null;
  duration_min: number | null;
  notes: string | null;
}

export interface FeedingRecordCreate {
  feed_time: string;
  feed_type: 'breast' | 'formula' | 'solid';
  amount_ml?: number | null;
  duration_min?: number | null;
  notes?: string | null;
}

export interface SleepRecord {
  id: string;
  sleep_start: string;
  sleep_end: string | null;
  night_wakings: number;
  sleep_type: 'nap' | 'night';
  notes: string | null;
}

export interface SleepRecordCreate {
  sleep_start: string;
  sleep_end?: string | null;
  night_wakings?: number;
  sleep_type: 'nap' | 'night';
  notes?: string | null;
}

export interface HealthRecord {
  id: string;
  record_date: string;
  record_type: 'vaccination' | 'illness' | 'checkup';
  title: string;
  description: string | null;
}

export interface HealthRecordCreate {
  record_date: string;
  record_type: 'vaccination' | 'illness' | 'checkup';
  title: string;
  description?: string | null;
}

export interface DiaperRecord {
  id: string;
  diaper_time: string;
  diaper_type: 'poop' | 'pee' | 'mixed';
  notes: string | null;
}

export interface DiaperRecordCreate {
  diaper_time: string;
  diaper_type: 'poop' | 'pee' | 'mixed';
  notes?: string | null;
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

export interface DashboardSummary {
  baby: {
    name: string | null;
    gender: 'male' | 'female' | null;
    birth_date: string | null;
    age_days: number | null;
    age_display: string | null;
  } | null;
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

export interface GrowthChartData {
  records: Array<{
    date: string;
    weight_g: number | null;
    height_cm: number | null;
    head_cm: number | null;
  }>;
  who_reference: {
    weight: WHOReferenceLines;
    height: WHOReferenceLines;
    head: WHOReferenceLines;
  };
}

export interface WHOReferenceLines {
  p3: Array<{ age_months: number; value: number }>;
  p15: Array<{ age_months: number; value: number }>;
  p50: Array<{ age_months: number; value: number }>;
  p85: Array<{ age_months: number; value: number }>;
  p97: Array<{ age_months: number; value: number }>;
}

export interface FeedingStatsData {
  days: number;
  daily: Array<{
    date: string;
    total_ml: number;
    breast_duration_min: number;
    count: number;
  }>;
  average_daily_ml: number;
  average_daily_breast_duration_min: number;
  average_daily_count: number;
}

export interface SleepStatsData {
  days: number;
  daily: Array<{
    date: string;
    total_hours: number | null;
    night_wakings: number | null;
  }>;
  average_daily_hours: number | null;
  average_night_wakings: number | null;
}

export interface DiaperStatsData {
  days: number;
  daily: Array<{
    date: string;
    poop: number;
    pee: number;
    mixed: number;
    total: number;
  }>;
  average_daily_poop: number;
  average_daily_pee: number;
  average_daily_mixed: number;
  average_daily_total: number;
}

export type PhotoTagType = 'scene' | 'expression' | 'milestone';

export interface Photo {
  id: string;
  storage_url: string;
  thumbnail_url?: string | null;
  original_filename: string;
  taken_at: string | null;
  uploaded_at: string;
  tags: PhotoTag[];
}

export interface PhotoTag {
  id: string;
  tag_type: PhotoTagType;
  tag_value: string;
  confidence: number;
  is_confirmed: boolean;
}

export interface PhotoDownloadResponse {
  download_url: string;
  expires_in_seconds: number;
}

export interface ProfileItem {
  id: string;
  scope: 'user' | 'family';
  content: string;
  created_at: string;
  updated_at: string;
}

export type MemoryFileKind = 'soul' | 'family' | 'baby' | 'user';

export interface MemoryFileSummary {
  id: string;
  label: string;
  kind: MemoryFileKind;
  filename: string;
  can_edit: boolean;
  limit: number;
}

export interface MemoryFileRead extends MemoryFileSummary {
  content: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type TrackerRecord = GrowthRecord | FeedingRecord | SleepRecord | HealthRecord | DiaperRecord;

export type MessageSearchResult = Message & { conversation_started_at: string };
