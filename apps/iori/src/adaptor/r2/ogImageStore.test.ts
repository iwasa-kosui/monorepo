import { describe, expect, it, vi } from 'vitest';

import { createR2OgImageStore } from './ogImageStore.ts';

describe('createR2OgImageStore', () => {
  it('writes PNG images with HTTP metadata', async () => {
    const put = vi.fn(async () => undefined);
    const store = createR2OgImageStore({ get: vi.fn(), put } as never);
    const body = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    await store.put({
      key: 'article-id',
      body,
      contentType: 'image/png',
    });

    expect(put).toHaveBeenCalledWith('og/article-id.png', body, {
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
  });
});
