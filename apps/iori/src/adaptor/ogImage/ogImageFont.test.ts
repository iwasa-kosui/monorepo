import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';

import { fetchOgFont } from './ogImageFont.ts';

const createFetch = () =>
  vi.fn(async (input: URL | RequestInfo) =>
    String(input).startsWith('https://fonts.googleapis.com/')
      ? new Response('src: url(https://fonts.gstatic.com/s/notosansjp/font.ttf) format("truetype");')
      : new Response(new Uint8Array([1, 2]))
  );

const cssBody = (...urls: string[]) => urls.map((url) => `src: url(${url}) format("truetype");`).join('\n');
const redirectResponse = () =>
  new Response(null, { status: 302, headers: { Location: 'https://evil.example/font.ttf' } });
const opaqueRedirectResponse = () =>
  Object.defineProperty(new Response(new Uint8Array([1, 2])), 'type', { value: 'opaqueredirect' });

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

  it('rejects a redirect response to the CSS request', async () => {
    const fetchRequest = vi.fn(async () => redirectResponse());

    await expect(fetchOgFont({ fetchRequest })).rejects.toThrow('redirected');
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects a redirect response to the font request', async () => {
    const fetchRequest = vi.fn(async (input: URL | RequestInfo) =>
      String(input).startsWith('https://fonts.googleapis.com/')
        ? new Response(cssBody('https://fonts.gstatic.com/s/notosansjp/font.ttf'))
        : redirectResponse()
    );

    await expect(fetchOgFont({ fetchRequest })).rejects.toThrow('redirected');
  });

  it('rejects an opaqueredirect response to the CSS request', async () => {
    const fetchRequest = vi.fn(async () => opaqueRedirectResponse());

    await expect(fetchOgFont({ fetchRequest })).rejects.toThrow('redirected');
  });

  it('rejects an opaqueredirect response to the font request', async () => {
    const fetchRequest = vi.fn(async (input: URL | RequestInfo) =>
      String(input).startsWith('https://fonts.googleapis.com/')
        ? new Response(cssBody('https://fonts.gstatic.com/s/notosansjp/font.ttf'))
        : opaqueRedirectResponse()
    );

    await expect(fetchOgFont({ fetchRequest })).rejects.toThrow('redirected');
  });

  it('passes redirect: manual to both requests', async () => {
    const fetchRequest = createFetch();

    await fetchOgFont({ fetchRequest });

    expect(fetchRequest.mock.calls).toHaveLength(2);
    for (const call of fetchRequest.mock.calls) {
      expect((call as unknown[])[1]).toMatchObject({ redirect: 'manual' });
    }
  });

  it('rejects a 3xx response returned by the Node fetch implementation with redirect: manual', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(302, { Location: 'https://evil.example/font.ttf' }).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const fetchRequest = ((input: URL | RequestInfo, init?: RequestInit) =>
        fetch(`http://127.0.0.1:${port}/`, init)) as typeof fetch;

      await expect(fetchOgFont({ fetchRequest })).rejects.toThrow('redirected');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('rejects a font URL outside fonts.gstatic.com', async () => {
    for (const url of ['https://evil.example/font.ttf', 'https://fonts.gstatic.com.evil.example/font.ttf']) {
      const fetchRequest = vi.fn(async () => new Response(cssBody(url)));

      await expect(fetchOgFont({ fetchRequest })).rejects.toThrow('Trusted font URL is missing.');
      expect(fetchRequest).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects a fonts.gstatic.com URL carrying a port or credentials', async () => {
    for (const url of ['https://fonts.gstatic.com:8443/font.ttf', 'https://user:pass@fonts.gstatic.com/font.ttf']) {
      const fetchRequest = vi.fn(async () => new Response(cssBody(url)));

      await expect(fetchOgFont({ fetchRequest })).rejects.toThrow();
      expect(fetchRequest).toHaveBeenCalledTimes(1);
    }
  });

  it('downloads only the first font URL when the CSS has several @font-face rules', async () => {
    const fetchRequest = vi.fn(async (input: URL | RequestInfo) =>
      String(input).startsWith('https://fonts.googleapis.com/')
        ? new Response(
          cssBody('https://fonts.gstatic.com/s/first.ttf', 'https://fonts.gstatic.com/s/second.ttf'),
        )
        : new Response(new Uint8Array([1, 2]))
    );

    await fetchOgFont({ fetchRequest });

    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(String(fetchRequest.mock.calls[1]?.[0])).toBe('https://fonts.gstatic.com/s/first.ttf');
  });
});
