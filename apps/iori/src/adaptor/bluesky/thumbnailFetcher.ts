import type { BlueskyThumbnailFetcher } from '../../ports/blueskyClient.ts';
import { createSafeFetcher } from '../http/safeFetch.ts';
import { BLUESKY_MAX_THUMB_BYTES } from './blueskyPostRecord.ts';

const FETCH_TIMEOUT_MS = 5000;

type ThumbnailFetcherDeps = Readonly<{ fetch?: typeof fetch }>;

const mimeTypeOf = (contentType: string | undefined): string | undefined =>
  contentType?.split(';')[0]?.trim().toLowerCase();

export const createBlueskyThumbnailFetcher = (deps: ThumbnailFetcherDeps = {}): BlueskyThumbnailFetcher => {
  const safeFetcher = createSafeFetcher({ fetch: deps.fetch });
  return {
    fetch: async (url) => {
      try {
        const fetched = await safeFetcher.fetchBytes(url, {
          timeoutMs: FETCH_TIMEOUT_MS,
          maxBytes: BLUESKY_MAX_THUMB_BYTES,
          maxRedirects: 0,
          acceptContentType: (contentType) => mimeTypeOf(contentType)?.startsWith('image/') === true,
        });
        if (!fetched.ok) return undefined;
        const mimeType = mimeTypeOf(fetched.val.contentType);
        const { bytes } = fetched.val;
        return bytes === undefined || mimeType === undefined ? undefined : { bytes, mimeType };
      } catch {
        return undefined;
      }
    },
  };
};
