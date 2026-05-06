'use client';

import { useEffect, useState } from 'react';
import { Images } from 'lucide-react';
import { PhotoGrid } from '@/components/album/PhotoGrid';
import { PhotoViewer } from '@/components/album/PhotoViewer';
import { UploadButton } from '@/components/album/UploadButton';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { canSoftDeleteData, canUploadPhotos } from '@/lib/utils';
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
  const [isLoading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadPhotos(nextView = view) {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.getPhotos({ view: nextView });
      setPhotos(response.items);
    } catch {
      setErrorMessage('照片加载失败，请稍后再试。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPhotos(view);
  }, [view]);

  async function upload(file: File) {
    setUploading(true);
    setErrorMessage(null);
    try {
      await api.uploadPhoto(file);
      await loadPhotos();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '照片上传失败，请稍后再试。');
    } finally {
      setUploading(false);
    }
  }

  const canUpload = canUploadPhotos(user?.access_type);
  const canDelete = canSoftDeleteData(user?.access_type);

  async function downloadSelectedPhoto() {
    if (!selected) return;
    const response = await api.getPhotoDownloadUrl(selected.id);
    const link = document.createElement('a');
    link.href = response.download_url;
    link.download = selected.original_filename;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function deleteSelectedPhoto() {
    if (!selected) return;
    const confirmed = window.confirm('确定删除这张照片吗？照片会从相册隐藏，但原始文件会保留在存储中。');
    if (!confirmed) return;
    await api.deletePhoto(selected.id);
    setSelected(null);
    await loadPhotos();
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="rounded-[24px] bg-white/85 p-2 shadow-card ring-1 ring-white/70">
        <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-nursery-mint text-brand-strong">
              <Images className="h-4 w-4" aria-hidden />
            </span>
            <p className="truncate text-xs italic text-mid-gray">按时间、场景和里程碑浏览</p>
          </div>
          <span className="shrink-0 rounded-full bg-warm-gray px-2.5 py-1 text-xs font-semibold text-dark-gray">
            {isLoading ? '加载中' : `${photos.length} 张`}
          </span>
        </div>
        <div className="grid grid-cols-3 rounded-2xl bg-warm-gray p-1">
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
      {errorMessage ? (
        <div className="rounded-2xl bg-safety-red-light px-4 py-3 text-sm text-safety-red">{errorMessage}</div>
      ) : null}
      <PhotoGrid photos={photos} view={view} onPhotoClick={setSelected} />
      {canUpload ? <UploadButton onUpload={upload} isUploading={isUploading} /> : null}
      {selected ? (
        <PhotoViewer
          photo={selected}
          onClose={() => setSelected(null)}
          onDownload={downloadSelectedPhoto}
          onDelete={canDelete ? deleteSelectedPhoto : undefined}
        />
      ) : null}
    </div>
  );
}
