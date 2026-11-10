import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyNotificationFetcher } from './blueskyNotificationFetcher.ts';

const clientReturning = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn(() => response);
  return { query, fetcher: createBlueskyNotificationFetcher({ client: { query } }) };
};

describe('createBlueskyNotificationFetcher', () => {
  it('listNotifications を limit と cursor だけで呼び、変換したページを返す', async () => {
    const { query, fetcher } = clientReturning(RA.ok({ notifications: [], cursor: 'next' }));

    const result = await fetcher.fetch({ limit: 100, cursor: 'prev' });

    expect(query).toHaveBeenCalledWith('app.bsky.notification.listNotifications', { limit: '100', cursor: 'prev' });
    expect(result).toEqual({ ok: true, val: { items: [], dropped: 0, cursor: 'next' } });
  });

  it('cursor が無ければ limit だけを送り、seenAt や reasons は送らない', async () => {
    const { query, fetcher } = clientReturning(RA.ok({ notifications: [] }));

    await fetcher.fetch({ limit: 100, cursor: undefined });

    expect(query).toHaveBeenCalledWith('app.bsky.notification.listNotifications', { limit: '100' });
    const params = query.mock.calls[0] as unknown as [string, Record<string, string>];
    expect(Object.keys(params[1])).toEqual(['limit']);
  });

  it('クライアントのエラーをそのまま返す', async () => {
    const err = { type: 'BlueskyClientError', kind: 'auth', message: 'x failed: status 401', status: 401 } as const;
    const { fetcher } = clientReturning(RA.err(err));

    expect(await fetcher.fetch({ limit: 1, cursor: undefined })).toEqual({ ok: false, err });
  });

  it('notifications が無い応答を invalid_response にする', async () => {
    const { fetcher } = clientReturning(RA.ok({ cursor: 'x' }));

    expect(await fetcher.fetch({ limit: 1, cursor: undefined })).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
  });
});
