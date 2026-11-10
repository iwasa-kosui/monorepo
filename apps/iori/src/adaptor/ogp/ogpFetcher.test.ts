import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOgpFetcher } from './ogpFetcher.ts';

const NIHONGO_SJIS = [0x93, 0xFA, 0x96, 0x7B, 0x8C, 0xEA];

const bytesOf = (...parts: (string | number[])[]): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    parts.flatMap((part) => typeof part === 'string' ? Array.from(new TextEncoder().encode(part)) : part),
  );

const stubHtml = (body: Uint8Array<ArrayBuffer>, contentType: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': contentType } })),
  );

afterEach(() => vi.unstubAllGlobals());

describe('createOgpFetcher charset', () => {
  it('reads a Shift_JIS <title> declared by the Content-Type charset', async () => {
    stubHtml(
      bytesOf('<html><head><title>', NIHONGO_SJIS, '</title></head></html>'),
      'text/html; charset=Shift_JIS',
    );
    const data = await createOgpFetcher().fetch('https://example.com/page');
    expect(data.title).toBe('日本語');
  });

  it('reads a Shift_JIS og:title declared by <meta charset>', async () => {
    stubHtml(
      bytesOf('<html><head><meta charset="Shift_JIS"><meta property="og:title" content="', NIHONGO_SJIS, '"></head>'),
      'text/html',
    );
    const data = await createOgpFetcher().fetch('https://example.com/page');
    expect(data.title).toBe('日本語');
  });
});
