'use client';

import { useEffect, useState } from 'react';

export const DEFAULT_VISIBLE_DAYS = 7;

export type ChartRange = {
  startIndex: number;
  endIndex: number;
};

export function defaultIndexRange(rowCount: number, visibleCount = DEFAULT_VISIBLE_DAYS): ChartRange {
  const endIndex = Math.max(0, rowCount - 1);
  return {
    startIndex: Math.max(0, endIndex - visibleCount + 1),
    endIndex,
  };
}

export function normalizeChartRange(
  range: { startIndex?: number; endIndex?: number },
  rowCount: number,
): ChartRange {
  const lastIndex = Math.max(0, rowCount - 1);
  const startIndex = Math.min(Math.max(0, range.startIndex ?? 0), lastIndex);
  const endIndex = Math.min(Math.max(startIndex, range.endIndex ?? lastIndex), lastIndex);
  return { startIndex, endIndex };
}

export function useChartRange(initialRange: ChartRange) {
  const [range, setRange] = useState<ChartRange>(initialRange);

  useEffect(() => {
    setRange(initialRange);
  }, [initialRange]);

  return [range, setRange] as const;
}
