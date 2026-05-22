import { describe, expect, it } from 'vitest';
import { formatAppDate } from '@/lib/utils';

describe('album date helpers', () => {
  it('formats dates in the app timezone', () => {
    expect(formatAppDate('2026-04-20T23:30:00Z', 'yyyy年M月d日')).toBe('2026年4月21日');
  });

  it('returns an empty label for invalid dates', () => {
    expect(formatAppDate('not-a-date', 'yyyy年M月d日')).toBe('');
  });
});
