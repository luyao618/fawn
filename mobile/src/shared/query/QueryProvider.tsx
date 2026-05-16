import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React, { useMemo } from 'react';

import { CACHE_MAX_AGE_MS, createQueryClient } from './queryClient';
import { CACHE_BUSTER, persister } from './persister';

interface Props {
  children: React.ReactNode;
}

export function QueryProvider({ children }: Props) {
  // useMemo so a Fast Refresh does not throw away the cache mid-session.
  const client = useMemo(() => createQueryClient(), []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        buster: CACHE_BUSTER,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
