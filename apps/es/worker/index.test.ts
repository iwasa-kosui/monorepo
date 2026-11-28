import { describe, expect, it, vi } from 'vitest';

import { handleRequest } from './index';

describe('handleRequest', () => {
  it('/healthz は ASSETS を呼ばずに 200 と ok を返す', async () => {
    const fetchAsset = vi.fn();
    const response = await handleRequest(new Request('https://example.com/healthz'), {
      ASSETS: { fetch: fetchAsset },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('/api/agent は ASSETS を呼ばず、AGENT_PASSWORD が未設定なら 503 を返す', async () => {
    const fetchAsset = vi.fn();
    const response = await handleRequest(new Request('https://example.com/api/agent', { method: 'POST' }), {
      ASSETS: { fetch: fetchAsset },
    });

    expect(response.status).toBe(503);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('/api/hands-on は ASSETS を呼ばず、Durable Object のバインディングが無ければ 503 を返す', async () => {
    const fetchAsset = vi.fn();
    const response = await handleRequest(new Request('https://example.com/api/hands-on'), {
      ASSETS: { fetch: fetchAsset },
    });

    expect(response.status).toBe(503);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('/api/ の下の知らないパスは、ASSETS を呼ばずに 404 を返す', async () => {
    const fetchAsset = vi.fn();
    const response = await handleRequest(new Request('https://example.com/api/unknown'), {
      ASSETS: { fetch: fetchAsset },
    });

    expect(response.status).toBe(404);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('それ以外のパスは ASSETS.fetch の応答をそのまま返す', async () => {
    const assetResponse = new Response('asset', { status: 404 });
    const fetchAsset = vi.fn().mockResolvedValue(assetResponse);
    const request = new Request('https://example.com/no-such-page');
    const response = await handleRequest(request, { ASSETS: { fetch: fetchAsset } });

    expect(fetchAsset).toHaveBeenCalledWith(request);
    expect(response).toBe(assetResponse);
  });
});
