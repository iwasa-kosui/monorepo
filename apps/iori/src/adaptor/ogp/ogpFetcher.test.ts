import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOgpFetcher } from './ogpFetcher.ts';

const NIHONGO_SJIS = [0x93, 0xFA, 0x96, 0x7B, 0x8C, 0xEA];
const FIVE_MIB = 5 * 1024 * 1024;
const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

const bytesOf = (...parts: (string | number[])[]): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    parts.flatMap((part) => typeof part === 'string' ? Array.from(new TextEncoder().encode(part)) : part),
  );

const asFetch = (mock: unknown) => mock as typeof fetch;

const htmlFetch = (body: Uint8Array<ArrayBuffer> | string, contentType: string) =>
  vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': contentType } }));

const page = (title: string) => `<html><head><meta property="og:title" content="${title}"></head></html>`;

const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location } });

const empty = {
  title: null,
  description: null,
  imageUrl: null,
  faviconUrl: null,
  siteName: null,
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createOgpFetcher charset', () => {
  it('reads a Shift_JIS <title> declared by the Content-Type charset', async () => {
    const fetchMock = htmlFetch(
      bytesOf('<html><head><title>', NIHONGO_SJIS, '</title></head></html>'),
      'text/html; charset=Shift_JIS',
    );
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/page');
    expect(data.title).toBe('日本語');
  });
});

describe('createOgpFetcher size limit', () => {
  it('returns empty data when Content-Length exceeds 5 MiB', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(page('big'), {
        status: 200,
        headers: { ...HTML_HEADERS, 'Content-Length': String(FIVE_MIB + 1) },
      })
    );
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/page');
    expect(data).toEqual(empty);
  });
});

describe('createOgpFetcher redirects', () => {
  it('follows up to 3 redirects, each with redirect: manual', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirect('https://example.com/2'))
      .mockResolvedValueOnce(redirect('https://example.com/3'))
      .mockResolvedValueOnce(redirect('https://example.com/4'))
      .mockResolvedValueOnce(new Response(page('Arrived'), { status: 200, headers: HTML_HEADERS }));
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/1');
    expect(data.title).toBe('Arrived');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ redirect: 'manual' }));
    }
  });

  it('returns empty data when a 4th redirect is needed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirect('https://example.com/2'))
      .mockResolvedValueOnce(redirect('https://example.com/3'))
      .mockResolvedValueOnce(redirect('https://example.com/4'))
      .mockResolvedValueOnce(redirect('https://example.com/5'))
      .mockResolvedValueOnce(new Response(page('Never'), { status: 200, headers: HTML_HEADERS }));
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/1');
    expect(data).toEqual(empty);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ redirect: 'manual' }));
    }
  });

  it('resolves a relative og:image and the favicon against the final url', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirect('https://cdn.example.net/dir/article'))
      .mockResolvedValueOnce(
        new Response(
          '<html><head><meta property="og:image" content="/img/og.png"><link rel="icon" href="icon.png"></head></html>',
          { status: 200, headers: HTML_HEADERS },
        ),
      );
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/short');
    expect(data.imageUrl).toBe('https://cdn.example.net/img/og.png');
    expect(data.faviconUrl).toBe('https://cdn.example.net/dir/icon.png');
  });

  it('uses the origin of the final url for the default favicon', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirect('https://cdn.example.net/article'))
      .mockResolvedValueOnce(new Response(page('Moved'), { status: 200, headers: HTML_HEADERS }));
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/short');
    expect(data.faviconUrl).toBe('https://cdn.example.net/favicon.ico');
  });
});

describe('createOgpFetcher content type and status', () => {
  it('returns empty data without reading the body for a non-HTML Content-Type', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetchMock = vi.fn(async () =>
      new Response(stream, { status: 200, headers: { 'Content-Type': 'application/pdf' } })
    );
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/doc.pdf');
    expect(data).toEqual(empty);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('accepts application/xhtml+xml', async () => {
    const fetchMock = htmlFetch(page('Xhtml'), 'application/xhtml+xml');
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/page');
    expect(data.title).toBe('Xhtml');
  });

  it('accepts a Content-Type with different letter case', async () => {
    const fetchMock = htmlFetch(page('Mixed case'), 'Text/HTML; charset=utf-8');
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/page');
    expect(data.title).toBe('Mixed case');
  });

  it('returns empty data for a failing status', async () => {
    const fetchMock = vi.fn(async () => new Response(page('Gone'), { status: 404, headers: HTML_HEADERS }));
    const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/page');
    expect(data).toEqual(empty);
  });

  it.each(['http://example.com/page', 'https://localhost/page'])(
    'does not fetch %s',
    async (url) => {
      const fetchMock = vi.fn();
      const data = await createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch(url);
      expect(data).toEqual(empty);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe('createOgpFetcher timeout', () => {
  it('returns empty data after 5 seconds when the body stream stalls', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return Promise.resolve(new Response(stream, { status: 200, headers: HTML_HEADERS }));
    });
    const pending = createOgpFetcher({ fetch: asFetch(fetchMock) }).fetch('https://example.com/page');
    await vi.advanceTimersByTimeAsync(4999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(empty);
  });
});
