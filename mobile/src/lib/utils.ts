// Mobile counterpart of selected utilities from
// `frontend/src/lib/utils.ts`. Self-contained age computation (no date-fns
// dependency in mobile).

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
