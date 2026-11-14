import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchFediverseConversations,
  fetchFediverseMessages,
  sendFediverseMessage,
} from './fediverseConversationClient.ts';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubFetch = (response: () => Response) => {
  const fetcher = vi.fn(async () => response());
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};

describe('fediverseConversationClient', () => {
  it('一覧と投稿の取得は、cursor と key をエンコードして同じオリジンへ GET する', async () => {
    const fetcher = stubFetch(() => jsonResponse({ conversations: [], cursor: null }));

    await fetchFediverseConversations('1_a b');
    await fetchFediverseMessages('a/b', 'c d');

    expect(fetcher.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      '/api/iori/v1/fediverse/conversations?cursor=1_a+b',
      '/api/iori/v1/fediverse/conversations/a%2Fb/messages?cursor=c+d',
    ]);
    expect((fetcher.mock.calls[0] as unknown[])[1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('失敗した応答はステータスと error と reason を持つエラーにして投げる', async () => {
    stubFetch(() => jsonResponse({ error: 'Validation failed: text', reason: 'empty' }, 422));

    await expect(sendFediverseMessage('k', ' ')).rejects.toMatchObject({
      status: 422,
      code: 'Validation failed: text',
      reason: 'empty',
    });
  });
});
