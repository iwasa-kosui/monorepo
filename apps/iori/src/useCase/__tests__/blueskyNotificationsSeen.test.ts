import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient } from '../../ports/blueskyClient.ts';
import { MarkBlueskyNotificationsSeenUseCase } from '../markBlueskyNotificationsSeen.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 3));

const setup = () => {
  const updateSeen = vi.fn<BlueskyClient['updateSeen']>(async () => RA.ok(undefined));
  const markSeen = MarkBlueskyNotificationsSeenUseCase.create({ client: { updateSeen }, now: () => NOW });
  return { markSeen, updateSeen };
};

describe('MarkBlueskyNotificationsSeenUseCase', () => {
  it('未来の seenAt は現在時刻に丸める', async () => {
    const t = setup();

    const result = await t.markSeen.run({ seenAt: Instant.orThrow(NOW + 3_600_000) });

    expect(result).toEqual({ ok: true, val: { seenAt: NOW } });
    expect(t.updateSeen).toHaveBeenCalledExactlyOnceWith(NOW);
  });
});
