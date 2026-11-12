import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import { MarkBlueskyNotificationsSeenUseCase } from '../markBlueskyNotificationsSeen.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 3));
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'updateSeen failed: status 500',
  status: 500,
};

const setup = () => {
  const updateSeen = vi.fn<BlueskyClient['updateSeen']>(async () => RA.ok(undefined));
  const markSeen = MarkBlueskyNotificationsSeenUseCase.create({ client: { updateSeen }, now: () => NOW });
  return { markSeen, updateSeen };
};

describe('MarkBlueskyNotificationsSeenUseCase', () => {
  it('過去の seenAt をそのまま Bluesky に渡す', async () => {
    const t = setup();
    const seenAt = Instant.orThrow(NOW - 60_000);

    const result = await t.markSeen.run({ seenAt });

    expect(result).toEqual({ ok: true, val: { seenAt } });
    expect(t.updateSeen).toHaveBeenCalledExactlyOnceWith(seenAt);
  });

  it('現在時刻ちょうどの seenAt はそのまま渡す', async () => {
    const t = setup();

    await t.markSeen.run({ seenAt: NOW });

    expect(t.updateSeen).toHaveBeenCalledExactlyOnceWith(NOW);
  });

  it('未来の seenAt は現在時刻に丸める', async () => {
    const t = setup();

    const result = await t.markSeen.run({ seenAt: Instant.orThrow(NOW + 3_600_000) });

    expect(result).toEqual({ ok: true, val: { seenAt: NOW } });
    expect(t.updateSeen).toHaveBeenCalledExactlyOnceWith(NOW);
  });

  it('Bluesky の失敗をそのまま返す', async () => {
    const t = setup();
    t.updateSeen.mockReturnValueOnce(RA.err(failure));

    expect(await t.markSeen.run({ seenAt: NOW })).toEqual({ ok: false, err: failure });
  });
});
