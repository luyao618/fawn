// Centralised TanStack Query key factory.
//
// Keep all query keys in this file so persisted cache entries are stable across
// the app and so feature code can invalidate slices without hand-rolling the
// key shape.

export const queryKeys = {
  baby: {
    all: ['baby'] as const,
    detail: () => [...queryKeys.baby.all, 'detail'] as const,
  },
} as const;
