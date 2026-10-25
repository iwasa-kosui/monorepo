import { describe, expect, it } from 'vitest';

import { backfillOgImages } from './ogImageBackfill.ts';

describe('backfillOgImages', () => {
  it('generates and uploads every published article under the Worker R2 key', async () => {
    const uploads: Array<Readonly<{ key: string; body: Uint8Array; cacheControl: string }>> = [];
    const result = await backfillOgImages({
      articles: [{ articleId: 'article-1', title: 'Migrated article' }],
      generate: async (title) => new TextEncoder().encode(`PNG:${title}`),
      upload: async (input) => {
        uploads.push(input);
      },
    });

    expect(result).toEqual({ backfilled: 1 });
    expect(uploads).toEqual([{
      key: 'og/article-1.png',
      body: new TextEncoder().encode('PNG:Migrated article'),
      cacheControl: 'public, max-age=31536000, immutable',
    }]);
  });
});
