import { describe, expect, it, vi } from 'vitest';

import { ArticleId } from '../../domain/article/articleId.ts';
import { createR2OgImageStore, type OgImageR2Bucket } from '../r2/ogImageStore.ts';
import { createOgImageRouter } from './ogImageRouter.tsx';

describe('OG image Worker route', () => {
  it('can be imported without sharp', async () => {
    const source = await import('./ogImageRouter.tsx');
    expect(source.createOgImageRouter).toBeDefined();
    expect('OgImageRouter' in source).toBe(false);
  });

  it('serves an article image from its injected store', async () => {
    const articleId = ArticleId.generate();
    const get = vi.fn(async () => new Response('image'));
    const app = createOgImageRouter({ get, put: vi.fn() });

    const response = await app.request(`/articles/${articleId}`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('image');
    expect(get).toHaveBeenCalledWith(articleId);
  });
});

describe('R2 OG image store', () => {
  it('serves a PNG object from the og prefix', async () => {
    const get = vi.fn(async () => ({
      body: new ReadableStream(),
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=60',
      },
    }));
    const store = createR2OgImageStore({ get } as unknown as OgImageR2Bucket);

    const response = await store.get('article-id');

    expect(get).toHaveBeenCalledWith('og/article-id.png');
    expect(response?.headers.get('Content-Type')).toBe('image/png');
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('returns 404 for a missing object without writing it', async () => {
    const put = vi.fn();
    const app = createOgImageRouter({ get: vi.fn(async () => undefined), put });

    const response = await app.request(`/articles/${ArticleId.generate()}`);

    expect(response.status).toBe(404);
    expect(put).not.toHaveBeenCalled();
  });
});
