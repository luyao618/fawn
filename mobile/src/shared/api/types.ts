// Shared API DTOs. These mirror the FastAPI response schemas in
// backend/src/fawn/api/schemas.py and are the single source of truth for any
// feature code that talks to the backend.

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
  role: 'user' | 'assistant';
  content: string;
  message_type: MessageType;
  metadata: { image_url?: string } | null;
  created_at: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: ChatMessage[];
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

// ---------- Records (feeding / growth / album) ----------

export interface FeedingRecord {
  id: string;
  feed_time: string;
  feed_type: 'breast' | 'formula' | 'solid';
  amount_ml: number | null;
  duration_min: number | null;
  notes: string | null;
}

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
  | { kind: 'weight'; id: string; record: GrowthRecord }
  | { kind: 'height'; id: string; record: GrowthRecord }
  | { kind: 'photo'; id: string; record: PhotoRecord };
