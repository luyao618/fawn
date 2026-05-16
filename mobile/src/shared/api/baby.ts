import { api } from './client';
import { queryKeys } from './queryKeys';
import type { Baby } from './types';

async function fetchBaby(): Promise<Baby | null> {
  const { data } = await api.get<Baby | null>('/baby');
  return data;
}

export const babyQueries = {
  detail: () => ({
    queryKey: queryKeys.baby.detail(),
    queryFn: fetchBaby,
  }),
};
