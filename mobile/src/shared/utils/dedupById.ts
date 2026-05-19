/**
 * Stable de-duplication by `id` preserving first occurrence.
 *
 * Used by chat pagination to merge overlapping cursor pages and to dedupe
 * locally-synthesized optimistic / streaming rows against the canonical
 * server rows that arrive after a refetch.
 */
export function dedupById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
