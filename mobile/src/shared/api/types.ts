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
