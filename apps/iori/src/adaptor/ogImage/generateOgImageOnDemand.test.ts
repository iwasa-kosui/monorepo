import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArticleId } from '../../domain/article/articleId.ts';
import type { OgImageStore } from '../../ports/ogImageStore.ts';
import {
  generateOgImageOnDemand,
  OG_IMAGE_FAILURE_LIMIT,
  OG_IMAGE_FAILURE_WINDOW_MS,
  type PublishedTitleResult,
} from './generateOgImageOnDemand.ts';

const articleId = ArticleId.generate();
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const fontData = new ArrayBuffer(4);

const setup = (
  overrides: Partial<{
    stored: Response | undefined;
    get: OgImageStore['get'];
    title: PublishedTitleResult | (() => Promise<PublishedTitleResult>);
    render: () => Promise<Uint8Array>;
    put: OgImageStore['put'];
    loadFont: () => Promise<ArrayBuffer>;
  }> = {},
) => {
  const clock = { time: 1_000_000 };
  const failures = new Map<string, number>();
  const get = vi.fn(overrides.get ?? (async () => overrides.stored));
  const put = vi.fn(overrides.put ?? (async () => undefined));
  const resolvePublishedTitle = vi.fn(async (): Promise<PublishedTitleResult> => {
    const title = overrides.title ?? { status: 'published', title: '日本語のタイトル' };
    return typeof title === 'function' ? title() : title;
  });
  const loadFont = vi.fn(overrides.loadFont ?? (async () => fontData));
  const render = vi.fn(overrides.render ?? (async () => png));
  const run = generateOgImageOnDemand({
    store: { get, put },
    resolvePublishedTitle,
    loadFont,
    render,
    now: () => clock.time,
    failures,
  });
  return { run, get, put, resolvePublishedTitle, loadFont, render, clock, failures };
};

const renderFailure = async (): Promise<Uint8Array> => {
  throw new Error('render failed');
};

describe('generateOgImageOnDemand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the stored image without rendering', async () => {
    const stored = new Response('stored');
    const { run, resolvePublishedTitle, render, put } = setup({ stored });

    expect(await run(articleId)).toEqual({ status: 'found', response: stored });
    expect(resolvePublishedTitle).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('renders, stores under the og key and returns the PNG when the article is published', async () => {
    const { run, put, loadFont, render } = setup();

    const result = await run(articleId);

    expect(result.status).toBe('found');
    const response = (result as Extract<typeof result, { status: 'found' }>).response;
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(loadFont).toHaveBeenCalledWith('日本語のタイトルblog.kosui.me');
    expect(render).toHaveBeenCalledWith({ title: '日本語のタイトル', fontData });
    expect(put).toHaveBeenCalledWith({ key: articleId, body: png, contentType: 'image/png' });
  });

  it('returns notFound without rendering or storing when there is no published article', async () => {
    const { run, put, loadFont, render } = setup({ title: { status: 'notFound' } });

    expect(await run(articleId)).toEqual({ status: 'notFound' });
    expect(loadFont).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('returns failed when reading the store throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { run, resolvePublishedTitle, render } = setup({
      get: async () => {
        throw new Error('get failed');
      },
    });

    expect(await run(articleId)).toEqual({ status: 'failed' });
    expect(resolvePublishedTitle).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('returns failed when resolving the title throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { run, render, put } = setup({
      title: async () => {
        throw new Error('resolve failed');
      },
    });

    expect(await run(articleId)).toEqual({ status: 'failed' });
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('returns failed without rendering when the title resolution reports a failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { run, loadFont, render, put } = setup({ title: { status: 'failed', error: new Error('db down') } });

    expect(await run(articleId)).toEqual({ status: 'failed' });
    expect(loadFont).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('returns failed and does not store when rendering fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { run, put } = setup({ render: renderFailure });

    expect(await run(articleId)).toEqual({ status: 'failed' });
    expect(put).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('returns failed and does not store when the font cannot be loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { run, put, render } = setup({
      loadFont: async () => {
        throw new Error('font failed');
      },
    });

    expect(await run(articleId)).toEqual({ status: 'failed' });
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('still returns the generated PNG when storing fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { run } = setup({
      put: async () => {
        throw new Error('put failed');
      },
    });

    const result = await run(articleId);

    expect(result.status).toBe('found');
    const response = (result as Extract<typeof result, { status: 'found' }>).response;
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(error).toHaveBeenCalled();
  });

  describe('after a generation failure', () => {
    it('skips generation for the same article within 60 seconds but still checks the store', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { run, get, render, loadFont, resolvePublishedTitle, clock } = setup({ render: renderFailure });

      expect(await run(articleId)).toEqual({ status: 'failed' });
      clock.time += OG_IMAGE_FAILURE_WINDOW_MS - 1;
      expect(await run(articleId)).toEqual({ status: 'failed' });

      expect(get).toHaveBeenCalledTimes(2);
      expect(render).toHaveBeenCalledTimes(1);
      expect(loadFont).toHaveBeenCalledTimes(1);
      expect(resolvePublishedTitle).toHaveBeenCalledTimes(1);
    });

    it('serves the stored image within the window if another request has stored it', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const stored = new Response('stored');
      const { run, get, clock } = setup({ render: renderFailure });

      expect(await run(articleId)).toEqual({ status: 'failed' });
      get.mockResolvedValueOnce(stored);
      clock.time += 1_000;

      expect(await run(articleId)).toEqual({ status: 'found', response: stored });
    });

    it('generates again after 60 seconds', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { run, render, clock } = setup({ render: renderFailure });

      await run(articleId);
      clock.time += OG_IMAGE_FAILURE_WINDOW_MS;
      await run(articleId);

      expect(render).toHaveBeenCalledTimes(2);
    });

    it('does not block other articles', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { run, render } = setup({ render: renderFailure });

      await run(articleId);
      await run(ArticleId.generate());

      expect(render).toHaveBeenCalledTimes(2);
    });

    it('clears the failure record once generation succeeds', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { run, render, failures, clock } = setup();
      render.mockRejectedValueOnce(new Error('render failed'));

      expect(await run(articleId)).toEqual({ status: 'failed' });
      expect(failures.has(articleId)).toBe(true);
      clock.time += OG_IMAGE_FAILURE_WINDOW_MS;
      expect((await run(articleId)).status).toBe('found');

      expect(failures.has(articleId)).toBe(false);
      expect(render).toHaveBeenCalledTimes(2);
    });

    it('drops the oldest records once the limit is exceeded', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { run, render, failures, clock } = setup({ render: renderFailure });
      const ids = Array.from({ length: OG_IMAGE_FAILURE_LIMIT + 1 }, () => ArticleId.generate());

      for (const id of ids) {
        clock.time += 1;
        await run(id);
      }

      expect(failures.size).toBe(OG_IMAGE_FAILURE_LIMIT);
      expect(failures.has(ids[0]!)).toBe(false);
      expect(failures.has(ids[1]!)).toBe(true);
      expect(failures.has(ids[OG_IMAGE_FAILURE_LIMIT]!)).toBe(true);

      render.mockClear();
      await run(ids[0]!);
      expect(render).toHaveBeenCalledTimes(1);
      await run(ids[OG_IMAGE_FAILURE_LIMIT]!);
      expect(render).toHaveBeenCalledTimes(1);
    });
  });
});
