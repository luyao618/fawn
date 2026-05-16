import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React from 'react';

import { CACHE_MAX_AGE_MS, queryClient } from './queryClient';
import { CACHE_BUSTER, persister } from './persister';

interface Props {
  children: React.ReactNode;
}

export function QueryProvider({ children }: Props) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
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
