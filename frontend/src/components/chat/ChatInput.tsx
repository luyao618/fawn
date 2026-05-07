'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (content: string, imageUrl?: string) => void;
  onAttach: (file: File) => Promise<string>;
  disabled?: boolean;
  attachedImage: string | null;
  onRemoveImage: () => void;
  historyHref?: string;
}

export function ChatInput({
  onSend,
  onAttach,
  disabled,
  attachedImage,
  onRemoveImage,
  historyHref,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const [isUploading, setUploading] = useState(false);
  const [isActionMenuOpen, setActionMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = Boolean(content.trim() || attachedImage) && !disabled && !isUploading;
  const canUpload = !disabled && !isUploading;
  const canOpenActions = canUpload || Boolean(historyHref);

  useEffect(() => {
    if (!isActionMenuOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setActionMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isActionMenuOpen]);

  function openPhotoPicker() {
    if (!canUpload) return;
    setActionMenuOpen(false);
    fileInputRef.current?.click();
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onAttach(file);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    setActionMenuOpen(false);
    onSend(content, attachedImage ?? undefined);
    setContent('');
  }

  return (
    <form onSubmit={submit} className="shrink-0 bg-transparent px-4 pb-3 pt-2">
      {attachedImage ? (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-white/90 p-2 shadow-card">
          <img src={attachedImage} alt="已选择图片" className="h-16 w-16 rounded-2xl object-cover" />
          <button
            type="button"
            onClick={onRemoveImage}
            className="grid h-11 w-11 place-items-center rounded-full bg-warm-gray text-dark-gray"
            aria-label="移除图片"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2 rounded-[30px] bg-white p-2 shadow-float ring-1 ring-white/70">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        <div ref={menuRef} className="relative shrink-0">
          {isActionMenuOpen ? (
            <div
              role="menu"
              className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-44 rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-float backdrop-blur"
            >
              {historyHref ? (
                <Link
                  href={historyHref}
                  role="menuitem"
                  className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-soft-charcoal hover:bg-warm-gray active:bg-nursery-mint"
                  onClick={() => setActionMenuOpen(false)}
                >
                  历史记录
                </Link>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={openPhotoPicker}
                disabled={!canUpload}
                className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-soft-charcoal hover:bg-warm-gray active:bg-nursery-mint"
              >
                上传照片
              </button>
            </div>
          ) : null}
          <button
            type="button"
            disabled={!canOpenActions}
            onClick={() => setActionMenuOpen((open) => !open)}
            className="grid h-11 w-11 place-items-center rounded-full bg-warm-gray text-dark-gray transition-colors disabled:text-mid-gray active:bg-nursery-mint"
            aria-label="更多操作"
            aria-expanded={isActionMenuOpen}
            aria-haspopup="menu"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onFocus={() => setActionMenuOpen(false)}
          disabled={disabled}
          rows={1}
          placeholder={isUploading ? '图片上传中...' : '输入消息...'}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-input bg-warm-gray px-4 py-2.5 text-base outline-none placeholder:text-mid-gray"
        />
        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition-colors',
            canSend ? 'bg-fawn-amber shadow-card' : 'bg-oat-border text-mid-gray',
          )}
          aria-label="发送"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}
