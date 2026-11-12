import { describe, expect, it } from 'vitest';

import type { Notification } from '../../adaptor/mastodon/entities.ts';
import { latestBlueskyNotificationAt } from './notificationSeen.ts';

const bluesky = (createdAt: string): Notification =>
  ({
    id: createdAt,
    type: 'favourite',
    created_at: createdAt,
    iori: { bluesky: { reason: 'like', url: 'https://bsky.app/x' } },
  }) as Notification;

const iori = (createdAt: string): Notification =>
  ({ id: createdAt, type: 'favourite', created_at: createdAt }) as Notification;

describe('latestBlueskyNotificationAt', () => {
  it('returns the newest created_at among the Bluesky notifications as an ISO string', () => {
    const result = latestBlueskyNotificationAt([
      bluesky('2026-01-02T03:04:05.000Z'),
      bluesky('2026-01-03T00:00:00.000Z'),
      bluesky('2026-01-01T00:00:00.000Z'),
    ]);

    expect(result).toBe('2026-01-03T00:00:00.000Z');
  });

  it('ignores notifications that do not come from Bluesky', () => {
    const result = latestBlueskyNotificationAt([iori('2026-02-01T00:00:00.000Z'), bluesky('2026-01-01T00:00:00.000Z')]);

    expect(result).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns undefined when there is no Bluesky notification', () => {
    expect(latestBlueskyNotificationAt([iori('2026-02-01T00:00:00.000Z')])).toBeUndefined();
    expect(latestBlueskyNotificationAt([])).toBeUndefined();
  });

  it('skips a created_at that cannot be parsed', () => {
    expect(latestBlueskyNotificationAt([bluesky('not a date'), bluesky('2026-01-01T00:00:00.000Z')]))
      .toBe('2026-01-01T00:00:00.000Z');
    expect(latestBlueskyNotificationAt([bluesky('not a date')])).toBeUndefined();
  });
});
