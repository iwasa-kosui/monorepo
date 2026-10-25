import type { R2Bucket } from '@cloudflare/workers-types';

import type { OgImageStore } from '../../ports/ogImageStore.ts';

export type OgImageR2Bucket = Pick<R2Bucket, 'get' | 'put'>;

const cacheControl = 'public, max-age=31536000, immutable';

export const createR2OgImageStore = (bucket: OgImageR2Bucket): OgImageStore => ({
  get: async (key) => {
    const object = await bucket.get(`og/${key}.png`);
    if (object === null) {
      return undefined;
    }

    return new Response(object.body as BodyInit, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType ?? 'image/png',
        'Cache-Control': object.httpMetadata?.cacheControl ?? cacheControl,
      },
    });
  },
  put: async ({ key, body, contentType }) => {
    await bucket.put(`og/${key}.png`, body, {
      httpMetadata: { contentType, cacheControl },
    });
  },
});
