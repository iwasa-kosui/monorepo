// @vitest-environment node
import { describe, expect, it } from 'vitest';

import worker from '../../public/_worker.js';

const png = (name: string): Response => new Response(name, { headers: { 'content-type': 'image/png' } });

const notFound = (): Response =>
  new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } });

/** 静的ファイルの配信の代わり。`files` にあるパスだけ画像を返し、求められたパスを記録する */
const createEnv = (files: readonly string[]) => {
  const requested: string[] = [];
  return {
    requested,
    ASSETS: {
      fetch: async (request: Request): Promise<Response> => {
        const { pathname } = new URL(request.url);
        requested.push(pathname);
        return files.includes(pathname) ? png(pathname) : notFound();
      },
    },
  };
};

const get = (path: string, userAgent?: string): Request =>
  new Request(`https://kosui.me${path}`, { headers: userAgent === undefined ? {} : { 'user-agent': userAgent } });

const HATENA_AGENTS = [
  'HatenaBookmark/4.0 (Hatena::Bookmark; Scissors)',
  'Hatena::Scissors/0.01',
  'Hatena-Favicon/2 (http://www.hatena.ne.jp/faq/)',
];

describe('OGP 画像の出し分け', () => {
  const files = ['/og/post.png', '/og/hatena/post.png', '/og/only-standard.png', '/og/talks/2026/talk.png'];

  it.each(HATENA_AGENTS)('はてなのクローラー（%s）には、はてな向けの画像を返す', async (userAgent) => {
    const env = createEnv(files);
    const response = await worker.fetch(get('/og/post.png', userAgent), env);
    expect(await response.text()).toBe('/og/hatena/post.png');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('vary')).toBe('User-Agent');
  });

  it.each([
    'Twitterbot/1.0',
    'facebookexternalhit/1.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    undefined,
  ])('ほかの相手（%s）には、通常の画像を返す', async (userAgent) => {
    const env = createEnv(files);
    const response = await worker.fetch(get('/og/post.png', userAgent), env);
    expect(await response.text()).toBe('/og/post.png');
    expect(env.requested).toEqual(['/og/post.png']);
    expect(response.headers.get('vary')).toBe('User-Agent');
  });

  it('はてな向けの画像が無いときは、通常の画像を返す', async () => {
    const env = createEnv(files);
    const response = await worker.fetch(get('/og/only-standard.png', HATENA_AGENTS[0]), env);
    expect(await response.text()).toBe('/og/only-standard.png');
    expect(response.status).toBe(200);
  });

  it('はてな向けの画像が変わっていなければ、304 をそのまま返す', async () => {
    const env = {
      ASSETS: { fetch: async (): Promise<Response> => new Response(null, { status: 304 }) },
    };
    const response = await worker.fetch(get('/og/post.png', HATENA_AGENTS[0]), env);
    expect(response.status).toBe(304);
  });

  it('OGP 画像でないパスは、はてなのクローラーにもそのまま返す', async () => {
    const env = createEnv(files);
    const response = await worker.fetch(get('/og/talks/2026/talk.png', HATENA_AGENTS[0]), env);
    expect(await response.text()).toBe('/og/talks/2026/talk.png');
    expect(env.requested).toEqual(['/og/talks/2026/talk.png']);
  });

  it('どちらの画像も無いときは、404 を返す', async () => {
    const env = createEnv(files);
    const response = await worker.fetch(get('/og/missing.png', HATENA_AGENTS[0]), env);
    expect(response.status).toBe(404);
  });
});
