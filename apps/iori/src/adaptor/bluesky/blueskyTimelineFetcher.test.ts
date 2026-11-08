import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyTimelineFetcher } from './blueskyTimelineFetcher.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8));
const clientReturning = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn(() => response);
  return { query, fetcher: createBlueskyTimelineFetcher({ client: { query }, now: () => NOW }) };
};

describe('createBlueskyTimelineFetcher', () => {
  it('getTimeline を limit と cursor つきで呼び、変換したページを返す', async () => {
    const { query, fetcher } = clientReturning(RA.ok({ feed: [], cursor: 'next' }));

    const result = await fetcher.fetch({ limit: 100, cursor: 'prev' });

    expect(query).toHaveBeenCalledWith('app.bsky.feed.getTimeline', { limit: '100', cursor: 'prev' });
    expect(result).toEqual({ ok: true, val: { items: [], dropped: 0, cursor: 'next' } });
  });

  it('cursor が無ければ limit だけを送る', async () => {
    const { query, fetcher } = clientReturning(RA.ok({ feed: [] }));

    await fetcher.fetch({ limit: 100, cursor: undefined });

    expect(query).toHaveBeenCalledWith('app.bsky.feed.getTimeline', { limit: '100' });
  });

  it('クライアントのエラーをそのまま返す', async () => {
    const err = { type: 'BlueskyClientError', kind: 'auth', message: 'x failed: status 401', status: 401 } as const;
    const { fetcher } = clientReturning(RA.err(err));

    expect(await fetcher.fetch({ limit: 1, cursor: undefined })).toEqual({ ok: false, err });
  });

  it('feed が無い応答を invalid_response にする', async () => {
    const { fetcher } = clientReturning(RA.ok({ cursor: 'x' }));

    expect(await fetcher.fetch({ limit: 1, cursor: undefined })).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
  });
});
