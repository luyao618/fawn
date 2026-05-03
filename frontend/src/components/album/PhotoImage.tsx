'use client';

import { useEffect, useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhotoImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

export function resolvePhotoImageUrl(src: string) {
  if (typeof window === 'undefined') return src;

  try {
    const url = new URL(src, window.location.href);
    if (url.hostname === 'minio') {
      url.hostname = window.location.hostname || 'localhost';
      return url.toString();
    }
  } catch {
    return src;
  }

  return src;
}

export function PhotoImage({ src, alt, className, fallbackClassName }: PhotoImageProps) {
  const resolvedSrc = useMemo(() => resolvePhotoImageUrl(src), [src]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [resolvedSrc]);

  if (hasError) {
    return (
      <div
        role="img"
        aria-label={`${alt} 加载失败`}
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-2 bg-warm-gray text-center text-xs text-mid-gray',
          fallbackClassName,
        )}
      >
        <ImageOff className="h-7 w-7 text-dark-gray/50" aria-hidden />
        <span className="px-4 leading-5">照片暂时无法加载</span>
      </div>
    );
  }

  return <img src={resolvedSrc} alt={alt} className={className} onError={() => setHasError(true)} />;
}
