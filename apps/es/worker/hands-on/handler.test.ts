import { describe, expect, it, vi } from 'vitest';

import { authorOf, handleHandsOn, type HandsOnEnv, roomName } from './handler.ts';

const origin = 'https://example.com';
const sender = 'a1b2c3d4-0000-4000-8000-000000000000';
const password = crypto.randomUUID();

const namespaceWith = (response: Response = new Response(null, { status: 204 })) => {
  const fetchRoom = vi.fn<(request: Request) => Promise<Response>>().mockResolvedValue(response);
  const idFromName = vi.fn((name: string) => `id:${name}`);
  const namespace = { idFromName, get: () => ({ fetch: fetchRoom }) };
  return { namespace, fetchRoom, idFromName };
};

const upgrade = (query = `?sender=${sender}`, headers: Record<string, string> = {}): Request =>
  new Request(`${origin}/api/hands-on${query}`, { headers: { upgrade: 'websocket', origin, ...headers } });

describe('handleHandsOn', () => {
  it('Durable Object のバインディングが無ければ 503 を返す', async () => {
    expect((await handleHandsOn(upgrade(), {})).status).toBe(503);
  });

  it('WebSocket の接続を、ハンズオンの部屋へ、送信者から作った author を付けて渡す', async () => {
    const { namespace, fetchRoom, idFromName } = namespaceWith();
    const response = await handleHandsOn(upgrade(), { HANDS_ON_ROOM: namespace });
    expect(response.status).toBe(204);
    expect(idFromName).toHaveBeenCalledWith(roomName);
    const forwarded = fetchRoom.mock.calls[0]?.[0];
    expect(forwarded?.headers.get('upgrade')).toBe('websocket');
    expect(new URL(forwarded?.url ?? '').searchParams.get('author')).toBe(await authorOf(sender));
    expect(forwarded?.url).not.toContain(sender);
  });

  it('author は、送信者ごとに決まる 12 桁の 16 進数である', async () => {
    expect(await authorOf(sender)).toMatch(/^[0-9a-f]{12}$/);
    expect(await authorOf(sender)).toBe(await authorOf(sender));
    expect(await authorOf(sender)).not.toBe(await authorOf(`${sender}x`));
  });

  it.each([
    ['WebSocket でない要求', new Request(`${origin}/api/hands-on?sender=${sender}`, { headers: { origin } }), 426],
    ['別のオリジンからの接続', upgrade(undefined, { origin: 'https://evil.example' }), 403],
    ['送信者の無い接続', upgrade(''), 400],
    ['送信者が不正な接続', upgrade('?sender=x'), 400],
    ['POST', new Request(`${origin}/api/hands-on`, { method: 'POST' }), 405],
  ])('%sは部屋へ渡さない', async (_, request, status) => {
    const { namespace, fetchRoom } = namespaceWith();
    expect((await handleHandsOn(request, { HANDS_ON_ROOM: namespace })).status).toBe(status);
    expect(fetchRoom).not.toHaveBeenCalled();
  });

  describe('メッセージの消去', () => {
    const remove = (token?: string): Request =>
      new Request(`${origin}/api/hands-on`, {
        method: 'DELETE',
        headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
      });

    it('管理用のパスワードが未設定なら 503 を返す', async () => {
      const { namespace, fetchRoom } = namespaceWith();
      expect((await handleHandsOn(remove(password), { HANDS_ON_ROOM: namespace })).status).toBe(503);
      expect(fetchRoom).not.toHaveBeenCalled();
    });

    it('パスワードが合えば、部屋に消去を頼む', async () => {
      const { namespace, fetchRoom } = namespaceWith();
      const env: HandsOnEnv = { HANDS_ON_ROOM: namespace, HANDS_ON_ADMIN_PASSWORD: password };
      expect((await handleHandsOn(remove(password), env)).status).toBe(204);
      expect(fetchRoom.mock.calls[0]?.[0].method).toBe('DELETE');
    });

    it('パスワードが違えば 401 を返し、失敗が続けば 429 を返す', async () => {
      const { namespace, fetchRoom } = namespaceWith();
      const limit = vi.fn().mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
      const env: HandsOnEnv = {
        HANDS_ON_ROOM: namespace,
        HANDS_ON_ADMIN_PASSWORD: password,
        AGENT_AUTH_FAILURE_LIMIT: { limit },
      };
      expect((await handleHandsOn(remove('wrong'), env)).status).toBe(401);
      expect((await handleHandsOn(remove(), env)).status).toBe(429);
      expect(fetchRoom).not.toHaveBeenCalled();
    });
  });
});
