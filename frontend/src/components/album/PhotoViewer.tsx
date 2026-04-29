'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Photo } from '@/lib/types';

interface PhotoViewerProps {
  photo: Photo;
  onClose: () => void;
  onConfirmTag?: (tagId: string) => void;
}

export function PhotoViewer({ photo, onClose, onConfirmTag }: PhotoViewerProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 text-white shadow-modal">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/40"
        aria-label="关闭预览"
      >
        <X className="h-6 w-6" />
      </button>
      <div className="flex h-full flex-col">
        <div className="grid flex-1 place-items-center p-4">
          <img src={photo.storage_url} alt={photo.original_filename} className="max-h-full rounded-xl object-contain" />
        </div>
        <div className="max-h-64 overflow-y-auto rounded-t-card bg-white p-4 text-soft-charcoal">
          <h2 className="mb-3 text-[17px] font-semibold">AI 标签</h2>
          <div className="space-y-2">
            {photo.tags.map((tag) => (
              <div key={tag.id} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-warm-gray px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">
                    {tag.tag_value}
                    {tag.is_confirmed ? <span className="ml-2 text-xs text-sage-green">已确认</span> : null}
                  </p>
                  <p className="text-xs text-dark-gray">
                    {tag.tag_type} · 置信度 {Math.round(tag.confidence * 100)}%
                  </p>
                </div>
                {tag.tag_type === 'milestone' && !tag.is_confirmed && onConfirmTag ? (
                  <Button className="min-h-10 px-3 py-2 text-sm" onClick={() => onConfirmTag(tag.id)}>
                    确认
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
