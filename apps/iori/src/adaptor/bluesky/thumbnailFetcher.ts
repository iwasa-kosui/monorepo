import { blockedReason } from '../../domain/feedSource/feedSourceUrl.ts';
import type { BlueskyThumbnailFetcher } from '../../ports/blueskyClient.ts';
import { BLUESKY_MAX_THUMB_BYTES } from './blueskyPostRecord.ts';

const FETCH_TIMEOUT_MS = 5000;

type ThumbnailFetcherDeps = Readonly<{ fetch?: typeof fetch }>;

export const createBlueskyThumbnailFetcher = (deps: ThumbnailFetcherDeps = {}): BlueskyThumbnailFetcher => {
  const fetchRequest = deps.fetch ?? globalThis.fetch;
  return {
    fetch: async (url) => {
      try {
        const target = new URL(url);
        if (blockedReason(target) !== undefined) return undefined;
        const response = await fetchRequest(target.href, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (!response.ok || mimeType === undefined || !mimeType.startsWith('image/')) return undefined;
        const declared = Number(response.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > BLUESKY_MAX_THUMB_BYTES) return undefined;
        const bytes = new Uint8Array(await response.arrayBuffer());
        return bytes.byteLength <= BLUESKY_MAX_THUMB_BYTES ? { bytes, mimeType } : undefined;
      } catch {
        return undefined;
      }
    },
  };
};
