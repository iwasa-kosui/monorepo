import { describe, expect, it } from 'vitest';

import { ArticleId } from '../article/articleId.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { Digest } from './digest.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));

const payload = () => ({
  userId: UserId.generate(),
  digestDate: '2026-11-05',
  articleId: ArticleId.generate(),
  items: [{
    feedEntryId: 'entry-1',
    url: 'https://example.com/a',
    title: 'A',
    rank: 1,
    score: null,
    summary: null,
    reasonInterestSourceId: null,
    feedback: null,
  }],
  trends: [{ kind: 'hatena' as const, rank: 1, url: 'https://example.com/h', title: 'H', count: 10 }],
});

describe('Digest', () => {
  it('create は digest、items、trends を aggregateState に持つ digest.created を返す', () => {
    const created = Digest.create(payload(), now);

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.val).toMatchObject({
      aggregateName: 'digest',
      eventName: 'digest.created',
      aggregateState: { digestDate: '2026-11-05', createdAt: now, pushSentAt: null },
    });
    expect(created.val.aggregateState.items).toHaveLength(1);
    expect(created.val.aggregateState.items[0]!.digestItemId).toEqual(expect.any(String));
    expect(created.val.aggregateState.trends).toHaveLength(1);
  });

  it('create は日付の形式が違う digest を作らない', () => {
    expect(Digest.create({ ...payload(), digestDate: '2026/11/05' }, now).ok).toBe(false);
  });

  it('recordPushSent は pushSentAt を入れた状態の digest.pushSent を返す', () => {
    const created = Digest.create(payload(), now);
    if (!created.ok) throw new Error('unexpected');
    const later = Instant.addDuration(now, 1000);

    const sent = Digest.recordPushSent(created.val.aggregateState, later);

    expect(sent.eventName).toBe('digest.pushSent');
    expect(sent.aggregateState.pushSentAt).toBe(later);
    expect(sent.eventPayload).toEqual({ digestId: created.val.aggregateState.digestId, pushSentAt: later });
  });

  it('expire は状態を持たない digest.expired を返す', () => {
    const created = Digest.create(payload(), now);
    if (!created.ok) throw new Error('unexpected');

    const expired = Digest.expire(created.val.aggregateState, now);

    expect(expired).toMatchObject({
      eventName: 'digest.expired',
      aggregateState: undefined,
      eventPayload: { digestId: created.val.aggregateState.digestId, digestDate: '2026-11-05' },
    });
  });
});
