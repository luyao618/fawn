import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

import { PERSIST_KEY, mmkvStorage } from './storage';

// Bump this whenever the dehydrated cache shape changes in a non-backwards-
// compatible way (e.g. query key shape changes). Mismatching buster values
// cause persistQueryClient to discard the on-disk cache on restore.
export const CACHE_BUSTER = 'v1';

export const persister = createSyncStoragePersister({
  storage: mmkvStorage,
  key: PERSIST_KEY,
});
