import { MMKV } from 'react-native-mmkv';

// Dedicated MMKV instance for the TanStack Query persistent cache. Keeping it
// separate from any future MMKV usage (settings, drafts, etc.) means we can
// clear the query cache without touching unrelated app state.
export const queryStorage = new MMKV({ id: 'fawn.query-cache' });

const KEY = 'fawn-query-cache';

// Hard cap on the serialized cache size we are willing to persist. TanStack
// Query persistence writes the full dehydrated state on every change, so an
// uncapped cache can grow unbounded as the user navigates. ~1 MiB is plenty
// for the kinds of small JSON responses this app deals with.
export const MAX_PERSIST_BYTES = 1024 * 1024;

// MMKV stores bytes, not JS code units. A string can contain multi-byte UTF-8
// characters (CJK, emoji) where `length` underestimates the on-disk footprint
// by 2-4x. Measure the true UTF-8 byte length so the guard reflects what
// actually gets persisted.
function utf8ByteLength(value: string): number {
  // TextEncoder is available in Hermes / modern RN runtimes.
  return new TextEncoder().encode(value).byteLength;
}

export const mmkvStorage = {
  getItem: (key: string): string | null => queryStorage.getString(key) ?? null,
  setItem: (key: string, value: string): void => {
    if (utf8ByteLength(value) > MAX_PERSIST_BYTES) {
      // Drop the write rather than blow up storage. A subsequent fetch will
      // simply re-fill the cache from the network.
      queryStorage.delete(key);
      return;
    }
    queryStorage.set(key, value);
  },
  removeItem: (key: string): void => queryStorage.delete(key),
};

export const PERSIST_KEY = KEY;

// Wipe the persisted TanStack Query cache. Call this on logout / account
// switch so the next user does not see the previous user's data restored
// from MMKV.
export function clearPersistedQueryCache(): void {
  queryStorage.delete(KEY);
}
