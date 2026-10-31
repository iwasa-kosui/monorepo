import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArticleId } from '../../domain/article/articleId.ts';
import type { OgImageStore } from '../../ports/ogImageStore.ts';
import { generateOgImageOnDemand } from './generateOgImageOnDemand.ts';

const articleId = ArticleId.generate();
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const fontData = new ArrayBuffer(4);

const setup = (
  overrides: Partial<{
    stored: Response | undefined;
    title: string | undefined;
    render: () => Promise<Uint8Array>;
    put: OgImageStore['put'];
    loadFont: () => Promise<ArrayBuffer>;
  }> = {},
) => {
  const get = vi.fn(async () => overrides.stored);
  const put = vi.fn(overrides.put ?? (async () => undefined));
  const resolvePublishedTitle = vi.fn(async () => 'title' in overrides ? overrides.title : '日本語のタイトル');
  const loadFont = vi.fn(overrides.loadFont ?? (async () => fontData));
  const render = vi.fn(overrides.render ?? (async () => png));
  const run = generateOgImageOnDemand({
    store: { get, put },
    resolvePublishedTitle,
    loadFont,
    render,
  });
  return { run, get, put, resolvePublishedTitle, loadFont, render };
};

describe('generateOgImageOnDemand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the stored image without rendering', async () => {
    const stored = new Response('stored');
    const { run, resolvePublishedTitle, render, put } = setup({ stored });

    expect(await run(articleId)).toBe(stored);
    expect(resolvePublishedTitle).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('renders, stores under the og key and returns the PNG when the article is published', async () => {
    const { run, put, loadFont, render } = setup();

    const response = await run(articleId);

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('image/png');
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(png);
    expect(loadFont).toHaveBeenCalledWith('日本語のタイトルblog.kosui.me');
    expect(render).toHaveBeenCalledWith({ title: '日本語のタイトル', fontData });
    expect(put).toHaveBeenCalledWith({ key: articleId, body: png, contentType: 'image/png' });
  });

  it('returns undefined without rendering or storing when there is no published article', async () => {
    const { run, put, loadFont, render } = setup({ title: undefined });

    expect(await run(articleId)).toBeUndefined();
    expect(loadFont).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('returns undefined and does not store when rendering fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { run, put } = setup({
      render: async () => {
        throw new Error('render failed');
      },
    });

    expect(await run(articleId)).toBeUndefined();
    expect(put).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('returns undefined and does not store when the font cannot be loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { run, put, render } = setup({
      loadFont: async () => {
        throw new Error('font failed');
      },
    });

    expect(await run(articleId)).toBeUndefined();
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

    const response = await run(articleId);

    expect(response?.status).toBe(200);
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(png);
    expect(error).toHaveBeenCalled();
  });
});
