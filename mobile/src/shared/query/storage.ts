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

export const mmkvStorage = {
  getItem: (key: string): string | null => queryStorage.getString(key) ?? null,
  setItem: (key: string, value: string): void => {
    if (value.length > MAX_PERSIST_BYTES) {
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
