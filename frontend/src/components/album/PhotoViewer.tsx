'use client';

import { Download, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { PhotoImage } from '@/components/album/PhotoImage';
import type { Photo } from '@/lib/types';

interface PhotoViewerProps {
  photo: Photo;
  onClose: () => void;
  onDownload?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

function iconButtonClass(tone: 'neutral' | 'delete' = 'neutral') {
  const color =
    tone === 'delete'
      ? 'text-[#D8AAA2] active:bg-[#6F2D2A]/30'
      : 'text-white/72 active:bg-white/12';
  return `grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/20 backdrop-blur-sm transition-colors ${color}`;
}

export function PhotoViewer({ photo, onClose, onDownload, onDelete }: PhotoViewerProps) {
  const [pendingAction, setPendingAction] = useState<'download' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const visibleTags = photo.tags.slice(0, 3);
  const extraTagCount = photo.tags.length - visibleTags.length;

  async function runAction(action: 'download' | 'delete', callback?: () => Promise<void> | void) {
    if (!callback) return;
    setPendingAction(action);
    setActionError(null);
    try {
      await callback();
    } catch {
      setActionError(action === 'download' ? '下载链接生成失败，请稍后再试。' : '删除失败，请稍后再试。');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#080A08] text-white shadow-modal">
      <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/75 via-black/40 to-transparent pb-10 pl-14 pr-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 break-all pr-2 text-sm font-semibold leading-5 text-white/95">
            {photo.original_filename}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/12 text-white backdrop-blur-md transition-colors active:bg-white/20"
            aria-label="关闭预览"
            title="关闭预览"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {actionError ? (
          <p className="mt-3 rounded-full bg-black/45 px-3 py-2 text-xs text-[#FFDAD6] backdrop-blur-md">
            {actionError}
          </p>
        ) : null}
      </div>

      <div className="absolute inset-0 grid place-items-center px-3 pb-24 pt-24">
        <PhotoImage
          src={photo.storage_url}
          alt={photo.original_filename}
          className="h-full w-full rounded-[18px] object-contain shadow-[0_26px_80px_rgba(0,0,0,0.35)]"
          fallbackClassName="h-full w-full rounded-[18px] bg-white/10 text-white/70"
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-16">
        <div className="flex items-end justify-between gap-3">
          {onDownload || onDelete ? (
            <div className="flex shrink-0 items-center gap-2">
              {onDownload ? (
                <button
                  type="button"
                  className={iconButtonClass()}
                  disabled={pendingAction !== null}
                  onClick={() => void runAction('download', onDownload)}
                  aria-label="下载照片"
                  title="下载照片"
                >
                  <Download className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className={iconButtonClass('delete')}
                  disabled={pendingAction !== null}
                  onClick={() => void runAction('delete', onDelete)}
                  aria-label="删除照片"
                  title="删除照片"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
          {visibleTags.length > 0 ? (
            <div className="ml-auto flex min-w-0 max-w-[46vw] flex-col items-end gap-1">
              {visibleTags.map((tag) => (
                <span
                  key={tag.id}
                  className="max-w-full truncate rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-medium text-white/60 backdrop-blur-sm"
                >
                  {tag.tag_value}
                </span>
              ))}
              {extraTagCount > 0 ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-medium text-white/50 backdrop-blur-sm">
                  +{extraTagCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
