import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { CollectBlueskyTimelineUseCase } from '../collectBlueskyTimeline.ts';
import type { ExpireBlueskyTimelineUseCase } from '../expireBlueskyTimeline.ts';
import { RefreshBlueskyTimelineUseCase } from '../refreshBlueskyTimeline.ts';

describe('RefreshBlueskyTimelineUseCase', () => {
  it('取り込みのあとに期限切れの削除を行い、取り込みの結果を返す', async () => {
    const order: string[] = [];
    const summary = { pages: 1, fetched: 2, saved: 2, dropped: 0 };
    const collect: CollectBlueskyTimelineUseCase = {
      run: vi.fn(async () => {
        order.push('collect');
        return RA.ok(summary);
      }),
    };
    const expire: ExpireBlueskyTimelineUseCase = {
      run: vi.fn(async () => {
        order.push('expire');
        return RA.ok(undefined);
      }),
    };

    const result = await RefreshBlueskyTimelineUseCase.create({ collect, expire }).run();

    expect(result).toEqual({ ok: true, val: summary });
    expect(order).toEqual(['collect', 'expire']);
  });

  it('取り込みが失敗してもエラーを返したうえで、期限切れの削除は行う', async () => {
    const error: BlueskyClientError = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'app.bsky.feed.getTimeline failed: status 500',
      status: 500,
    };
    const collect: CollectBlueskyTimelineUseCase = { run: vi.fn(async () => RA.err(error)) };
    const expire: ExpireBlueskyTimelineUseCase = { run: vi.fn(async () => RA.ok(undefined)) };

    const result = await RefreshBlueskyTimelineUseCase.create({ collect, expire }).run();

    expect(result).toEqual({ ok: false, err: error });
    expect(expire.run).toHaveBeenCalledOnce();
  });
});
