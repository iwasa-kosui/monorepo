import { describe, expect, it, vi } from 'vitest';

import { isBlockedUri } from './blockedInboxDomain.ts';
import { createLookupUrlResolver, validateLiteralPublicUrl } from './lookupUrlResolver.ts';

const URL_ = 'https://remote.example/@alice/1';
const NOTE = 'https://remote.example/users/alice/statuses/1';
const BLOCKED_NOTE = 'https://blocked.example/notes/1';

const json = () => new Response('{}', { headers: { 'Content-Type': 'application/activity+json' } });
const html = (body: string, link?: string) =>
  new Response(body, { headers: { 'Content-Type': 'text/html', ...(link === undefined ? {} : { Link: link }) } });
const alternateLink = (href: string) => `<${href}>; rel="alternate"; type="application/activity+json"`;
const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location } });

const setup = (responses: Readonly<Record<string, () => Response>>, validateUrl = async () => {}) => {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const response = responses[url];
    if (response === undefined) throw new Error(`unexpected fetch: ${url}`);
    return response();
  });
  const resolve = createLookupUrlResolver({
    isBlockedUri: (uri) => isBlockedUri(uri, ['blocked.example']),
    fetch: fetch as unknown as typeof globalThis.fetch,
    validateUrl,
  });
  const fetched = () => fetch.mock.calls.map(([input]) => (input instanceof Request ? input.url : String(input)));
  return { resolve: (url = URL_) => resolve(url, { signal: new AbortController().signal }), fetch, fetched };
};

describe('createLookupUrlResolver', () => {
  it('ActivityPub の文書が返れば、その URL を返す', async () => {
    const t = setup({ [URL_]: json });

    expect(await t.resolve()).toEqual({ type: 'resolved', url: URL_ });
  });

  it('ActivityPub の Accept を付け、リダイレクトを自分で追う設定で取得する', async () => {
    const t = setup({ [URL_]: json });

    await t.resolve();

    const request = t.fetch.mock.calls[0]![0] as Request;
    expect(request.headers.get('Accept')).toContain('application/activity+json');
    expect(request.redirect).toBe('manual');
  });

  it('ブロックしたドメインの URL は取得しない', async () => {
    const t = setup({});

    expect(await t.resolve(BLOCKED_NOTE)).toEqual({ type: 'blocked' });
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('Link ヘッダーの rel=alternate の先がブロックしたドメインなら、その先を取得しない', async () => {
    const t = setup({ [URL_]: () => html('<html></html>', alternateLink(BLOCKED_NOTE)) });

    expect(await t.resolve()).toEqual({ type: 'blocked' });
    expect(t.fetched()).toEqual([URL_]);
  });

  it('HTML の link 要素の rel=alternate の先がブロックしたドメインなら、その先を取得しない', async () => {
    const t = setup({
      [URL_]: () =>
        html(
          `<html><head><link rel="alternate" type="application/activity+json" href="${BLOCKED_NOTE}"></head></html>`,
        ),
    });

    expect(await t.resolve()).toEqual({ type: 'blocked' });
    expect(t.fetched()).toEqual([URL_]);
  });

  it('リダイレクトの先がブロックしたドメインなら、その先を取得しない', async () => {
    const t = setup({ [URL_]: () => redirect(BLOCKED_NOTE) });

    expect(await t.resolve()).toEqual({ type: 'blocked' });
    expect(t.fetched()).toEqual([URL_]);
  });

  it('ブロックしていない rel=alternate の先とリダイレクトの先は追い、行き着いた URL を返す', async () => {
    const moved = 'https://remote.example/notes/1';
    const t = setup({
      [URL_]: () => html('<html></html>', alternateLink(NOTE)),
      [NOTE]: () => redirect(moved),
      [moved]: json,
    });

    expect(await t.resolve()).toEqual({ type: 'resolved', url: moved });
    expect(t.fetched()).toEqual([URL_, NOTE, moved]);
  });

  it('公開されていないアドレスの URL は取得しない', async () => {
    const t = setup({ [URL_]: json }, async () => {
      throw new Error('Invalid or private address');
    });

    expect(await t.resolve()).toEqual({ type: 'blocked' });
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('401 などの失敗や取得の例外では、その時点の URL を返して署名付きの取得に任せる', async () => {
    const unauthorized = setup({ [URL_]: () => new Response('', { status: 401 }) });
    const failed = setup({});

    expect(await unauthorized.resolve()).toEqual({ type: 'resolved', url: URL_ });
    expect(await failed.resolve()).toEqual({ type: 'resolved', url: URL_ });
  });

  it('rel=alternate の無い HTML では、その URL を返す', async () => {
    const t = setup({ [URL_]: () => html('<html></html>') });

    expect(await t.resolve()).toEqual({ type: 'resolved', url: URL_ });
  });
});

describe('validateLiteralPublicUrl', () => {
  it.each([
    'http://127.0.0.1/notes/1',
    'http://10.0.0.1/notes/1',
    'http://192.168.1.1/notes/1',
    'http://[::1]/notes/1',
    'http://localhost/notes/1',
    'http://app.localhost/notes/1',
    'ftp://remote.example/notes/1',
  ])('%s を拒む', async (url) => {
    await expect(validateLiteralPublicUrl(url)).rejects.toThrow();
  });

  it.each(['https://remote.example/notes/1', 'https://1.1.1.1/notes/1', 'https://[2606:4700::1111]/notes/1'])(
    '%s を受け付ける',
    async (url) => {
      await expect(validateLiteralPublicUrl(url)).resolves.toBeUndefined();
    },
  );
});
