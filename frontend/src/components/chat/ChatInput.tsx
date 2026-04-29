'use client';

import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (content: string, imageUrl?: string) => void;
  onAttach: (file: File) => Promise<string>;
  disabled?: boolean;
  attachedImage: string | null;
  onRemoveImage: () => void;
}

export function ChatInput({ onSend, onAttach, disabled, attachedImage, onRemoveImage }: ChatInputProps) {
  const [content, setContent] = useState('');
  const [isUploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canSend = Boolean(content.trim() || attachedImage) && !disabled && !isUploading;

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
    onSend(content, attachedImage ?? undefined);
    setContent('');
  }

  return (
    <form onSubmit={submit} className="border-t border-oat-border bg-white px-3 py-2 safe-bottom">
      {attachedImage ? (
        <div className="mb-2 flex items-center gap-2">
          <img src={attachedImage} alt="已选择图片" className="h-16 w-16 rounded-xl object-cover" />
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

      <div className="flex items-end gap-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        <button
          type="button"
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-dark-gray disabled:text-mid-gray"
          aria-label="选择图片"
        >
          <ImagePlus className="h-6 w-6" />
        </button>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
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
            canSend ? 'bg-fawn-amber' : 'bg-oat-border text-mid-gray',
          )}
          aria-label="发送"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}
