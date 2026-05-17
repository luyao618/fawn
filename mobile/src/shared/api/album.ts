// Album API layer — list/upload/download/delete photos under /album/photos.
//
// Mirrors the photo endpoints used by the Web album page
// (`frontend/src/app/(main)/album/page.tsx`):
//   - GET    /album/photos?view=timeline|scene|milestone (paginated)
//   - POST   /album/photos                                (multipart upload)
//   - GET    /album/photos/{id}/download                  (presigned URL)
//   - DELETE /album/photos/{id}                           (soft delete)
//
// Upload is RN-flavored: instead of a Web File we pass the local URI emitted
// by expo-image-picker — the file gets streamed to FormData the way React
// Native expects (`{ uri, type, name }`).

import { api } from './client';
import { queryKeys } from './queryKeys';
import type { PhotoRecord } from './types';

export type AlbumView = 'timeline' | 'scene' | 'milestone';

export interface PhotoDownloadResponse {
  download_url: string;
  expires_in_seconds: number;
}

interface PaginatedPhotos {
  items: PhotoRecord[];
  total: number;
  page: number;
  page_size: number;
}

async function fetchPhotosByView(view: AlbumView): Promise<PhotoRecord[]> {
  const { data } = await api.get<PaginatedPhotos>('/album/photos', {
    params: { view, page: 1, page_size: 100 },
  });
  return data.items;
}

export async function uploadAlbumPhoto(
  uri: string,
  mimeType: string,
  filename: string,
): Promise<PhotoRecord> {
  const form = new FormData();
  form.append('file', { uri, type: mimeType, name: filename } as unknown as Blob);
  const { data } = await api.post<PhotoRecord>('/album/photos', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getPhotoDownloadUrl(id: string): Promise<PhotoDownloadResponse> {
  const { data } = await api.get<PhotoDownloadResponse>(`/album/photos/${id}/download`);
  return data;
}

export async function deletePhoto(id: string): Promise<void> {
  await api.delete(`/album/photos/${id}`);
}

export const albumQueries = {
  photos: (view: AlbumView) => ({
    queryKey: queryKeys.album.photos(view),
    queryFn: () => fetchPhotosByView(view),
  }),
};
