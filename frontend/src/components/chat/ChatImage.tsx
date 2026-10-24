'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function ChatImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState<{ src: string; url: string } | null>(null);
  const isApiImage = src.startsWith('/api/chat/');

  useEffect(() => {
    if (!isApiImage) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    api.getChatImage(src, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ src, url: objectUrl });
    }).catch(() => {
      if (!controller.signal.aborted) setLoaded(null);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, isApiImage]);

  const resolved = isApiImage ? (loaded?.src === src ? loaded.url : undefined) : src;
  return <img src={resolved} alt={alt} className={className} />;
}
