import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { FeedEntryId } from '../../domain/feedEntry/feedEntryId.ts';
import type { XFeedEntriesResolver, XFeedEntry } from '../../domain/feedEntry/xFeedEntry.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { GetXFeedEntriesUseCase } from '../getXFeedEntries.ts';

const entry: XFeedEntry = {
  feedEntryId: FeedEntryId.generate(),
  sourceTitle: '@jack',
  text: '本文',
  url: 'https://x.com/jack/status/1',
  postedAt: Instant.orThrow(1_000),
};

describe('GetXFeedEntriesUseCase', () => {
  it('リゾルバーに上限と現在時刻を渡し、返った投稿をそのまま返す', async () => {
    const resolve = vi.fn<XFeedEntriesResolver['resolve']>(async () => RA.ok([entry]));
    const now = Instant.orThrow(5_000);
    const useCase = GetXFeedEntriesUseCase.create({ xFeedEntriesResolver: { resolve }, now: () => now });

    const result = await useCase.run({ limit: 30 });

    expect(resolve).toHaveBeenCalledWith({ limit: 30, now });
    expect(result).toEqual({ ok: true, val: [entry] });
  });
});
