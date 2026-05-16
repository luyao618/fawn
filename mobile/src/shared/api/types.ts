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
