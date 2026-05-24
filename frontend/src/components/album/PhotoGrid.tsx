'use client';

import { PhotoImage } from '@/components/album/PhotoImage';
import { formatAppDate } from '@/lib/utils';
import type { Photo } from '@/lib/types';

interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
}

function photoDate(photo: Photo) {
  return photo.taken_at ?? photo.uploaded_at;
}

function photoDateLabel(photo: Photo, pattern = 'M月d日') {
  return formatAppDate(photoDate(photo), pattern);
}

function groupPhotos(photos: Photo[]) {
  return photos.reduce<Record<string, Photo[]>>((acc, photo) => {
    const key = photoDateLabel(photo, 'yyyy年M月d日') || '未知日期';
    acc[key] = [...(acc[key] ?? []), photo];
    return acc;
  }, {});
}

export function PhotoGrid({ photos, onPhotoClick }: PhotoGridProps) {
  const groups = groupPhotos(photos);
  if (photos.length === 0) {
    return (
      <div className="rounded-card bg-white/85 p-6 text-center text-sm leading-6 text-dark-gray shadow-card ring-1 ring-white/70">
        还没有照片。上传后，这里会按拍摄时间自动整理。
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([group, items]) => (
        <section key={group}>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-dark-gray">{group}</h2>
            <span className="text-xs text-mid-gray">{items.length} 张</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {items.map((photo) => {
              const label = photoDateLabel(photo);
              return (
                <button
                  type="button"
                  key={photo.id}
                  onClick={() => onPhotoClick(photo)}
                  className="relative aspect-[4/5] overflow-hidden rounded-[24px] bg-warm-gray text-left shadow-card transition-transform active:scale-[0.99]"
                  aria-label={`查看照片：${label || photo.original_filename}`}
                >
                  <PhotoImage
                    src={photo.thumbnail_url ?? photo.storage_url}
                    alt={photo.original_filename}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-white">
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
