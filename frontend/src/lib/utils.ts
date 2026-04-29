import { type ClassValue, clsx } from 'clsx';
import { format, intervalToDuration, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string | Date, pattern = 'M月d日 HH:mm') {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, pattern, { locale: zhCN });
}

export function formatDate(value: string | Date, pattern = 'M月d日') {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, pattern, { locale: zhCN });
}

export function getAgeDisplay(birthDate: string, now = new Date()) {
  const duration = intervalToDuration({ start: parseISO(birthDate), end: now });
  const months = (duration.years ?? 0) * 12 + (duration.months ?? 0);
  const days = duration.days ?? 0;
  if (months <= 0) return `${days}天`;
  return `${months}个月${days}天`;
}

export function getAgeDays(birthDate: string, now = new Date()) {
  const diff = now.getTime() - parseISO(birthDate).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function toKg(grams: number | null) {
  if (grams == null) return '暂无';
  return `${(grams / 1000).toFixed(1)}kg`;
}

export function roleLabel(role: string) {
  if (role === 'admin') return '管理员';
  if (role === 'parent') return '父母';
  return '家人';
}

export function canWriteTracker(role: string | undefined, permissions?: { can_write_tracker: boolean }) {
  if (role === 'admin' || role === 'parent') return true;
  return Boolean(permissions?.can_write_tracker);
}

export function canUploadPhotos(role: string | undefined, permissions?: { can_upload_photos: boolean }) {
  if (role === 'admin' || role === 'parent') return true;
  return Boolean(permissions?.can_upload_photos);
}
