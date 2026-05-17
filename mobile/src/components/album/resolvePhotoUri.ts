// Resolve a backend photo URL into one that the mobile device can actually
// reach. Backend presigned URLs sometimes encode a hostname (e.g. `minio`)
// that is only resolvable inside Docker Compose; we replace it with the API
// host the app is configured to talk to so the device can fetch the asset.
//
// Mirrors `resolvePhotoImageUrl()` in `frontend/src/components/album/PhotoImage.tsx`
// but operates on the API base URL (instead of `window.location`).

import { getApiBaseUrl } from '../../lib/api';

const INTERNAL_HOSTS = new Set(['minio', 'localhost']);

export function resolvePhotoUri(src: string): string {
  if (!src) return src;

  // Relative URL ("/path") → prefix with the API base URL.
  if (src.startsWith('/')) {
    return `${getApiBaseUrl()}${src}`;
  }

  // Replace internal docker hostnames with the API host we're talking to.
  try {
    const url = new URL(src);
    if (INTERNAL_HOSTS.has(url.hostname)) {
      const apiBase = new URL(getApiBaseUrl());
      url.hostname = apiBase.hostname;
      if (apiBase.port) url.port = apiBase.port;
      url.protocol = apiBase.protocol;
      return url.toString();
    }
  } catch {
    // Not a parseable URL — fall through and return as-is.
  }
  return src;
}
