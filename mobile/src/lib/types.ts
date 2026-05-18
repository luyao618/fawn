// Mobile counterpart of `frontend/src/lib/types.ts` — only the subset the
// mobile app currently needs (profile/family/baby/user). Add more as features
// land.

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
