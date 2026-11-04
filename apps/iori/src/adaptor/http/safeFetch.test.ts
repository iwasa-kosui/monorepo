import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSafeFetcher, type SafeFetchOptions } from './safeFetch.ts';

const options: SafeFetchOptions = { timeoutMs: 1000, maxBytes: 1024, maxRedirects: 3 };

const textResponse = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { Location: location } });

afterEach(() => vi.useRealTimers());

describe('createSafeFetcher blocked targets', () => {
  it.each([
    ['http://example.com/feed', 'blocked_url'],
    ['https://127.0.0.1/feed', 'blocked_url'],
    ['https://10.0.0.1/feed', 'blocked_url'],
    ['https://2130706433/feed', 'blocked_url'],
    ['https://[::1]/feed', 'blocked_url'],
    ['https://[2001:db8::1]/feed', 'blocked_url'],
    ['https://localhost/feed', 'blocked_url'],
    ['https://LOCALHOST./feed', 'blocked_url'],
    ['https://printer.local/feed', 'blocked_url'],
    ['https://db.internal/feed', 'blocked_url'],
    ['not a url', 'invalid_url'],
  ])('rejects %s without fetching', async (url, reason) => {
    const fetchMock = vi.fn();
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(url, options);
    expect(result).toMatchObject({ ok: false, err: { type: 'SafeFetchError', reason } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createSafeFetcher fetching', () => {
  it('returns the body with validators and sends the user agent and extra headers', async () => {
    const fetchMock = vi.fn(async () =>
      textResponse('<rss/>', {
        headers: {
          ETag: '"abc"',
          'Last-Modified': 'Wed, 01 Jan 2026 00:00:00 GMT',
          'Content-Type': 'application/rss+xml; charset=utf-8',
        },
      })
    );
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      { ...options, headers: { 'If-None-Match': '"old"' } },
    );
    expect(result).toEqual({
      ok: true,
      val: {
        status: 200,
        body: '<rss/>',
        etag: '"abc"',
        lastModified: 'Wed, 01 Jan 2026 00:00:00 GMT',
        finalUrl: 'https://example.com/feed',
        contentType: 'application/rss+xml; charset=utf-8',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/feed',
      expect.objectContaining({
        redirect: 'manual',
        headers: { 'User-Agent': 'iori-digest/1.0 (+https://blog.kosui.me)', 'If-None-Match': '"old"' },
      }),
    );
  });

  it('leaves contentType undefined when the response has no Content-Type', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([111, 107]), { status: 200 }));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/page',
      options,
    );
    expect(result).toMatchObject({ ok: true, val: { body: 'ok' } });
    expect(result.ok && result.val.contentType).toBeUndefined();
  });

  it('decodes a Shift_JIS body by the Content-Type charset', async () => {
    const sjis = new Uint8Array([0x93, 0xFA, 0x96, 0x7B, 0x8C, 0xEA]);
    const fetchMock = vi.fn(async () =>
      new Response(sjis, { status: 200, headers: { 'Content-Type': 'text/html; charset=Shift_JIS' } })
    );
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/page',
      options,
    );
    expect(result).toMatchObject({ ok: true, val: { body: '日本語' } });
  });

  it('returns ok with status 304 and no body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 304 }));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: true, val: { status: 304, finalUrl: 'https://example.com/feed' } });
    expect(result.ok && result.val.body).toBeUndefined();
  });

  it('returns an error for a failing status', async () => {
    const fetchMock = vi.fn(async () => new Response('x', { status: 503 }));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: false, err: { reason: 'http_status', status: 503 } });
  });

  it('returns a network error when fetch throws', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connection reset');
    });
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: false, err: { reason: 'network', message: 'connection reset' } });
  });
});

describe('createSafeFetcher redirects', () => {
  it('follows relative and absolute locations and reports the final url', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirect('/moved'))
      .mockResolvedValueOnce(redirect('https://cdn.example.net/final', 301))
      .mockResolvedValueOnce(textResponse('ok'));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: true, val: { body: 'ok', finalUrl: 'https://cdn.example.net/final' } });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://example.com/feed',
      'https://example.com/moved',
      'https://cdn.example.net/final',
    ]);
  });

  it('fails when the redirects exceed the limit', async () => {
    const fetchMock = vi.fn(async () => redirect('https://example.com/again'));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      { ...options, maxRedirects: 2 },
    );
    expect(result).toMatchObject({ ok: false, err: { reason: 'too_many_redirects' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    'http://example.com/plain',
    'https://127.0.0.1/admin',
    'https://[::1]/admin',
    'https://localhost/admin',
    'https://nas.local/admin',
  ])('rejects a redirect to %s without requesting it', async (location) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirect(location));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: false, err: { reason: 'blocked_url' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails on a redirect without Location', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: false, err: { reason: 'http_status', status: 302 } });
  });
});

describe('createSafeFetcher size limit', () => {
  it('fails when the body exceeds maxBytes and stops reading', async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        pulls += 1;
        controller.enqueue(new Uint8Array(400));
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: false, err: { reason: 'too_large' } });
    expect(pulls).toBeLessThan(10);
  });

  it('fails early when Content-Length exceeds maxBytes', async () => {
    const fetchMock = vi.fn(async () => textResponse('x', { headers: { 'Content-Length': '999999' } }));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: false, err: { reason: 'too_large' } });
  });

  it('accepts a body of exactly maxBytes', async () => {
    const fetchMock = vi.fn(async () => textResponse('a'.repeat(1024)));
    const result = await createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      options,
    );
    expect(result).toMatchObject({ ok: true });
  });
});

describe('createSafeFetcher timeout', () => {
  it('aborts the request after timeoutMs', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    );
    const pending = createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      { ...options, timeoutMs: 50 },
    );
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toMatchObject({ ok: false, err: { reason: 'timeout' } });
  });

  it('aborts while the body is still streaming', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    });
    const pending = createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      { ...options, timeoutMs: 50 },
    );
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toMatchObject({ ok: false, err: { reason: 'timeout' } });
  });

  it('counts the time across redirects against timeoutMs', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      if (url === 'https://example.com/feed') {
        return new Promise<Response>((resolve) => setTimeout(() => resolve(redirect('/moved')), 40));
      }
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const pending = createSafeFetcher({ fetch: fetchMock as unknown as typeof fetch }).fetchText(
      'https://example.com/feed',
      { ...options, timeoutMs: 50 },
    );
    await vi.advanceTimersByTimeAsync(60);
    expect(await pending).toMatchObject({ ok: false, err: { reason: 'timeout' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
