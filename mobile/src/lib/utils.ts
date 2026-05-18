// Mobile counterpart of selected utilities from
// `frontend/src/lib/utils.ts`. Self-contained age computation (no date-fns
// dependency in mobile).

/**
 * Lightweight `clsx`/`tailwind-merge` replacement — RN has no className
 * pipeline so we just filter truthy strings and join. Kept to mirror the web
 * `cn(...)` call shape so ported components diff cleanly.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter((value): value is string => Boolean(value)).join(' ');
}

function parseIsoLocal(value: string): Date {
  // Treat bare YYYY-MM-DD as local-date (date-fns parseISO does same) so the
  // displayed month/day matches the user's wall clock instead of shifting by
  // timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }
  return new Date(value);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Mobile `formatDate` — supports the patterns used by the dashboard port:
 * default `M月d日`, plus `yyyy年M月d日` and `M/d`. Falls back to default for
 * any other pattern instead of pulling in date-fns.
 */
export function formatDate(value: string | Date, pattern = 'M月d日'): string {
  const date = typeof value === 'string' ? parseIsoLocal(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (pattern === 'yyyy年M月d日') return `${y}年${m}月${d}日`;
  if (pattern === 'M/d') return `${m}/${d}`;
  return `${m}月${d}日`;
}

/**
 * Mobile `formatDateTime` — default `M月d日 HH:mm` mirrors web.
 */
export function formatDateTime(value: string | Date, pattern = 'M月d日 HH:mm'): string {
  const date = typeof value === 'string' ? parseIsoLocal(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  if (pattern === 'M月d日 HH:mm') return `${m}月${d}日 ${hh}:${mm}`;
  return `${m}月${d}日 ${hh}:${mm}`;
}

/** Mobile `toKg` — `grams/1000` to 1 decimal kg; `暂无` when null. */
export function toKg(grams: number | null | undefined): string {
  if (grams == null) return '暂无';
  return `${(grams / 1000).toFixed(1)}kg`;
}

export function accessTypeLabel(accessType: string | undefined | null): string {
  if (accessType === 'parent') return '父母权限';
  if (accessType === 'family') return '家人权限';
  return '朋友权限';
}

export function roleLabel(role: string | undefined | null): string {
  return role || '家庭成员';
}

export function canManageFamily(accessType: string | undefined | null): boolean {
  return accessType === 'parent';
}

/**
 * Mirrors web `canWriteTracker()` — friends are read-only, everyone else can
 * write feeding/sleep/growth/health records.
 */
export function canWriteTracker(accessType: string | undefined | null): boolean {
  return accessType === 'parent' || accessType === 'family';
}

/**
 * Return "X个月Y天" or "Nd天" — mirrors web `getAgeDisplay()` semantics
 * without pulling in date-fns. `birthDate` is an ISO date string (YYYY-MM-DD).
 */
export function getAgeDisplay(
  birthDate: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!birthDate) return '暂无';
  const start = new Date(birthDate);
  if (Number.isNaN(start.getTime())) return '暂无';

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();

  if (days < 0) {
    // Borrow days from the previous month.
    months -= 1;
    const borrowMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += borrowMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  if (totalMonths <= 0) return `${Math.max(0, days)}天`;
  return `${totalMonths}个月${Math.max(0, days)}天`;
}
