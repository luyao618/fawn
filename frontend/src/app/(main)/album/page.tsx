'use client';

import { useEffect, useState } from 'react';
import { Images, Sparkles } from 'lucide-react';
import { PhotoGrid } from '@/components/album/PhotoGrid';
import { PhotoViewer } from '@/components/album/PhotoViewer';
import { UploadButton } from '@/components/album/UploadButton';
import { Card } from '@/components/ui/Card';
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
    <div className="space-y-5 px-4 py-4">
      <Card className="bg-gradient-to-br from-white to-fawn-amber-light">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-nursery-powder text-info-blue">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fawn-amber">智慧相册</p>
            <h2 className="mt-1 text-xl font-semibold leading-tight text-soft-charcoal">自动整理场景、表情和里程碑</h2>
            <p className="mt-2 text-sm leading-6 text-dark-gray">
              上传后会先给出 AI 标签，重要里程碑可以由父母确认，方便以后回看成长片段。
            </p>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3 rounded-card bg-white/85 p-2 shadow-card ring-1 ring-white/70">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-nursery-mint text-brand-strong">
          <Images className="h-5 w-5" aria-hidden />
        </span>
        <div className="grid flex-1 grid-cols-3 rounded-2xl bg-warm-gray p-1">
        {modes.map((mode) => (
          <button
            type="button"
            key={mode.value}
            onClick={() => setView(mode.value)}
            className={`min-h-10 rounded-xl text-sm font-semibold ${view === mode.value ? 'bg-white text-fawn-amber shadow-card' : 'text-dark-gray'}`}
          >
            {mode.label}
          </button>
        ))}
        </div>
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
