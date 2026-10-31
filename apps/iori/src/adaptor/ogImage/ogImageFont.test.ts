import { describe, expect, it, vi } from 'vitest';

import { fetchOgFont } from './ogImageFont.ts';

const createFetch = () =>
  vi.fn(async (input: URL | RequestInfo) =>
    String(input).startsWith('https://fonts.googleapis.com/')
      ? new Response('src: url(https://fonts.gstatic.com/s/notosansjp/font.ttf) format("truetype");')
      : new Response(new Uint8Array([1, 2]))
  );

describe('fetchOgFont', () => {
  it('requests the full font CSS when text is omitted', async () => {
    const fetchRequest = createFetch();

    expect((await fetchOgFont({ fetchRequest })).byteLength).toBe(2);
    expect(fetchRequest.mock.calls[0]?.[0]).toBe('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700');
  });

  it('adds the encoded text parameter to request a subset', async () => {
    const fetchRequest = createFetch();

    await fetchOgFont({ fetchRequest, text: '日本語 &blog' });

    expect(fetchRequest.mock.calls[0]?.[0]).toBe(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent('日本語 &blog')}`,
    );
  });
});
