'use client';

import { ChangeEvent, useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface UploadButtonProps {
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}

export function UploadButton({ onUpload, isUploading }: UploadButtonProps) {
  const ref = useRef<HTMLInputElement>(null);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await onUpload(file);
    event.target.value = '';
  }

  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onChange} />
      <Button type="button" onClick={() => ref.current?.click()} loading={isUploading} className="fixed bottom-[calc(106px+var(--safe-area-bottom))] right-[max(16px,calc((100vw-428px)/2+16px))] z-30 h-12 px-4 shadow-float">
        <Upload className="h-5 w-5" aria-hidden />
        上传
      </Button>
    </>
  );
}
