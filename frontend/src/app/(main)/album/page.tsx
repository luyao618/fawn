'use client';

import { useEffect, useState } from 'react';
import { PhotoGrid } from '@/components/album/PhotoGrid';
import { PhotoViewer } from '@/components/album/PhotoViewer';
import { UploadButton } from '@/components/album/UploadButton';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { canUploadPhotos } from '@/lib/utils';
import type { Photo } from '@/lib/types';

type ViewMode = 'timeline' | 'scene' | 'milestone';

const modes: Array<{ value: ViewMode; label: string }> = [
  { value: 'timeline', label: '时间线' },
  { value: 'scene', label: '场景' },
  { value: 'milestone', label: '里程碑' },
];

export default function AlbumPage() {
  const user = useAuthStore((state) => state.user);
  const [view, setView] = useState<ViewMode>('timeline');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [isUploading, setUploading] = useState(false);

  async function loadPhotos(nextView = view) {
    const response = await api.getPhotos({ view: nextView });
    setPhotos(response.items);
  }

  useEffect(() => {
    void loadPhotos(view);
  }, [view]);

  async function upload(file: File) {
    setUploading(true);
    try {
      await api.uploadPhoto(file);
      await loadPhotos();
    } finally {
      setUploading(false);
    }
  }

  async function confirmTag(tagId: string) {
    if (!selected) return;
    await api.confirmTag(selected.id, tagId);
    const fresh = await api.getPhoto(selected.id);
    setSelected(fresh);
    await loadPhotos();
  }

  const canUpload = canUploadPhotos(user?.role, user?.permissions);

  return (
    <div className="px-4 py-4">
      <div className="mb-4 grid grid-cols-3 rounded-xl bg-warm-gray p-1">
        {modes.map((mode) => (
          <button
            type="button"
            key={mode.value}
            onClick={() => setView(mode.value)}
            className={`min-h-10 rounded-lg text-sm ${view === mode.value ? 'bg-white text-fawn-amber shadow-card' : 'text-dark-gray'}`}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <PhotoGrid photos={photos} view={view} onPhotoClick={setSelected} />
      {canUpload ? <UploadButton onUpload={upload} isUploading={isUploading} /> : null}
      {selected ? (
        <PhotoViewer
          photo={selected}
          onClose={() => setSelected(null)}
          onConfirmTag={user?.role === 'admin' || user?.role === 'parent' ? (tagId) => void confirmTag(tagId) : undefined}
        />
      ) : null}
    </div>
  );
}
