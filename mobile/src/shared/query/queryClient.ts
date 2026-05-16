import { QueryClient } from '@tanstack/react-query';

// Cache lifetimes:
// - staleTime keeps a successful response "fresh" so a re-mount inside this
//   window short-circuits and renders cached data with no network or loading
//   spinner (acceptance criterion #1).
// - gcTime governs how long unused entries stay in memory; the persister
//   piggybacks on this for the on-disk lifetime, so we keep it generous to
//   support offline reads (acceptance criterion #2).
// - persisted entries older than MAX_AGE are dropped on restore, giving us
//   the cache expiration story (acceptance criterion #3).
export const CACHE_STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes
export const CACHE_GC_TIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: CACHE_STALE_TIME_MS,
        gcTime: CACHE_GC_TIME_MS,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
