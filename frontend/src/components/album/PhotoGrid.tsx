'use client';

import { formatDate } from '@/lib/utils';
import type { Photo } from '@/lib/types';

interface PhotoGridProps {
  photos: Photo[];
  view: 'timeline' | 'scene' | 'milestone';
  onPhotoClick: (photo: Photo) => void;
}

function groupPhotos(photos: Photo[], view: PhotoGridProps['view']) {
  return photos.reduce<Record<string, Photo[]>>((acc, photo) => {
    let key = '未分类';
    if (view === 'timeline') key = formatDate(photo.taken_at ?? photo.uploaded_at, 'yyyy年M月d日');
    if (view === 'scene') key = photo.tags.find((tag) => tag.tag_type === 'scene')?.tag_value ?? '未识别场景';
    if (view === 'milestone') {
      key = photo.tags.find((tag) => tag.tag_type === 'milestone')?.tag_value ?? '普通照片';
    }
    acc[key] = [...(acc[key] ?? []), photo];
    return acc;
  }, {});
}

export function PhotoGrid({ photos, view, onPhotoClick }: PhotoGridProps) {
  const groups = groupPhotos(photos, view);
  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([group, items]) => (
        <section key={group}>
          <h2 className="mb-2 text-sm font-semibold text-dark-gray">{group}</h2>
          <div className="grid grid-cols-2 gap-3">
            {items.map((photo) => {
              const label =
                photo.tags.find((tag) => tag.tag_type === 'milestone')?.tag_value ??
                photo.tags.find((tag) => tag.tag_type === 'scene')?.tag_value ??
                '照片';
              return (
                <button
                  type="button"
                  key={photo.id}
                  onClick={() => onPhotoClick(photo)}
                  className="relative aspect-square overflow-hidden rounded-xl bg-warm-gray text-left"
                >
                  <img src={photo.storage_url} alt={photo.original_filename} className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-2 pt-8 text-white">
                    <p className="truncate text-xs">{formatDate(photo.taken_at ?? photo.uploaded_at)}</p>
                    <p className="truncate text-sm font-semibold">{label}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
