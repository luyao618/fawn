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
