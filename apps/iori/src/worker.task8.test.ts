import type { ExecutionContext } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { admissionFixture } from './testing/admissionFixture.ts';

const ogImage = vi.hoisted(() => ({
  resolveArticle: vi.fn(),
  render: vi.fn(),
  fetchFont: vi.fn(),
}));

const runtime = vi.hoisted(() => ({
  auth: { signInUseCase: {} },
  timeline: { getTimelineUseCase: {} },
  posting: { createPostUseCase: {} },
  socialActions: {
    sendLikeUseCase: {},
    undoLikeUseCase: {},
    sendRepostUseCase: {},
    undoRepostUseCase: {},
    sendEmojiReactUseCase: {},
    undoEmojiReactUseCase: {},
  },
  notifications: {
    getUnreadNotificationCountUseCase: {},
    getNotificationsUseCase: {},
    getLikedPostsUseCase: {},
  },
  articles: {
    getArticleWithThreadUseCase: {},
    getArticlesUseCase: {},
    createArticleUseCase: {},
    publishArticleUseCase: {},
    unpublishArticleUseCase: {},
    deleteArticleUseCase: {},
    publishedArticlesResolver: {},
    publishOgImage: async () => undefined,
  },
  core: {
    signUpUseCase: {},
    sendReplyUseCase: {},
    deletePostUseCase: {},
    sendFollowRequestUseCase: {},
    getFederatedTimelineUseCase: {},
    getUserPostsUseCase: {},
    getRemoteActorPostsUseCase: {},
    getServerTimelineUseCase: {},
    threadResolver: {},
    subscribePushUseCase: {},
    unsubscribePushUseCase: {},
    vapidPublicKey: 'public-key',
  },
  mutesRelays: {
    getMutesUseCase: {},
    createMuteUseCase: {},
    deleteMuteUseCase: {},
    subscribeRelayUseCase: {},
    allRelaysResolver: {},
  },
  uploads: { get: async () => undefined },
  federation: { createContext: () => ({}) },
}));

vi.mock('./runtime/workerRuntime.ts', () => ({
  createWorkerRuntimePorts: async () => runtime,
}));
vi.mock('./adaptor/d1/article/articleResolver.ts', () => ({
  createD1ArticleResolver: () => ({ resolve: ogImage.resolveArticle }),
}));
vi.mock('./adaptor/ogImage/workerOgImageRenderer.ts', () => ({ renderWorkerOgImage: ogImage.render }));
vi.mock('./adaptor/ogImage/ogImageFont.ts', () => ({ fetchOgFont: ogImage.fetchFont }));
vi.mock('@fedify/hono', () => ({
  federation: () => async (_context: unknown, next: () => Promise<void>) => next(),
}));

import worker from './worker.ts';

describe('Task 8 Worker OGP route', () => {
  const articleId = '573c7c51-0e4b-453c-bb9f-5dbd15a319a7';
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves the R2 object for the public OGP URL', async () => {
    const get = vi.fn(async () => ({
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
      httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=60' },
    }));
    const env = { ...admissionFixture(), UPLOADS: { get } } as never;

    const response = await worker.fetch(
      new Request('https://worker.test/api/og/articles/573c7c51-0e4b-453c-bb9f-5dbd15a319a7'),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(get).toHaveBeenCalledWith('og/573c7c51-0e4b-453c-bb9f-5dbd15a319a7.png');
  });

  it('rejects invalid article IDs before reading UPLOADS', async () => {
    const get = vi.fn();
    const env = { ...admissionFixture(), UPLOADS: { get } } as never;

    const response = await worker.fetch(
      new Request('https://worker.test/api/og/articles/not-an-article-id'),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it('generates, stores and serves the image on an R2 miss for a published article', async () => {
    const get = vi.fn(async () => null);
    const put = vi.fn(async () => undefined);
    ogImage.resolveArticle.mockResolvedValue({ ok: true, val: { title: '公開記事', status: 'published' } });
    ogImage.fetchFont.mockResolvedValue(new ArrayBuffer(4));
    ogImage.render.mockResolvedValue(png);
    const env = { ...admissionFixture(), UPLOADS: { get, put } } as never;

    const response = await worker.fetch(
      new Request(`https://worker.test/api/og/articles/${articleId}`),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(ogImage.fetchFont).toHaveBeenCalledWith({ text: '公開記事blog.kosui.me' });
    expect(put).toHaveBeenCalledWith(`og/${articleId}.png`, png, expect.anything());
  });

  it('returns 404 on an R2 miss for an unpublished article without rendering', async () => {
    const get = vi.fn(async () => null);
    const put = vi.fn();
    ogImage.resolveArticle.mockResolvedValue({ ok: true, val: { title: '下書き', status: 'draft' } });
    const env = { ...admissionFixture(), UPLOADS: { get, put } } as never;

    const response = await worker.fetch(
      new Request(`https://worker.test/api/og/articles/${articleId}`),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    expect(ogImage.render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('returns 404 on an R2 miss when the article does not exist', async () => {
    const get = vi.fn(async () => null);
    const put = vi.fn();
    ogImage.resolveArticle.mockResolvedValue({ ok: true, val: undefined });
    const env = { ...admissionFixture(), UPLOADS: { get, put } } as never;

    const response = await worker.fetch(
      new Request(`https://worker.test/api/og/articles/${articleId}`),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    expect(ogImage.render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
