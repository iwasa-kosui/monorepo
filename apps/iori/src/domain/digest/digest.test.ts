import { describe, expect, it } from 'vitest';

import { ArticleId } from '../article/articleId.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { Digest, DigestItemNotFoundError } from './digest.ts';
import { DigestItemId } from './digestItemId.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));

const payload = () => ({
  userId: UserId.generate(),
  digestDate: '2026-11-05',
  articleId: ArticleId.generate(),
  trigger: 'scheduled' as const,
  topicKey: 'summary',
  items: [{
    feedEntryId: 'entry-1',
    url: 'https://example.com/a',
    title: 'A',
    rank: 1,
    score: null,
    summary: null,
    reasonInterestSourceId: null,
    feedback: null,
    feedbackAt: null,
  }],
  trends: [{ kind: 'hatena' as const, rank: 1, url: 'https://example.com/h', title: 'H', count: 10 }],
  xPostFeedEntryIds: ['x-1', 'x-2'],
});

describe('Digest', () => {
  it('create は digest、items、trends を aggregateState に持つ digest.created を返す', () => {
    const created = Digest.create(payload(), now);

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.val).toMatchObject({
      aggregateName: 'digest',
      eventName: 'digest.created',
      aggregateState: {
        digestDate: '2026-11-05',
        createdAt: now,
        pushSentAt: null,
        trigger: 'scheduled',
        topicKey: 'summary',
      },
    });
    expect(created.val.aggregateState.items).toHaveLength(1);
    expect(created.val.aggregateState.items[0]!.digestItemId).toEqual(expect.any(String));
    expect(created.val.aggregateState.trends).toHaveLength(1);
    expect(created.val.aggregateState.xPostFeedEntryIds).toEqual(['x-1', 'x-2']);
  });

  it('create は日付の形式が違う digest を作らない', () => {
    expect(Digest.create({ ...payload(), digestDate: '2026/11/05' }, now).ok).toBe(false);
  });

  it('create は requested の trigger を aggregateState に持つ', () => {
    const created = Digest.create({ ...payload(), trigger: 'requested' }, now);

    expect(created.ok && created.val.aggregateState.trigger).toBe('requested');
  });

  it('create は未知の trigger の digest を作らない', () => {
    expect(Digest.create({ ...payload(), trigger: 'manual' as never }, now).ok).toBe(false);
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

  describe('giveFeedback', () => {
    const digestOf = () => {
      const created = Digest.create(payload(), now);
      if (!created.ok) throw new Error('unexpected');
      return created.val.aggregateState;
    };
    const later = Instant.addDuration(now, 1000);

    it('反応がまだ無い項目には、押した値と時刻を入れた digest.itemFeedbackGiven を返す', () => {
      const digest = digestOf();
      const { digestItemId } = digest.items[0]!;

      const given = Digest.giveFeedback(digest, digestItemId, 'interested', later);

      expect(given.ok).toBe(true);
      if (!given.ok) return;
      expect(given.val).toMatchObject({
        aggregateName: 'digest',
        eventName: 'digest.itemFeedbackGiven',
        eventPayload: { digestItemId, feedback: 'interested', feedbackAt: later },
      });
      expect(given.val.aggregateState.items[0]).toMatchObject({ feedback: 'interested', feedbackAt: later });
    });

    it('別の値が入っていれば切り替える', () => {
      const digest = digestOf();
      const { digestItemId } = digest.items[0]!;
      const first = Digest.giveFeedback(digest, digestItemId, 'interested', now);
      if (!first.ok) throw new Error('unexpected');

      const second = Digest.giveFeedback(first.val.aggregateState, digestItemId, 'not_interested', later);

      expect(second.ok && second.val.eventPayload).toEqual({
        digestItemId,
        feedback: 'not_interested',
        feedbackAt: later,
      });
    });

    it('同じ値が入っていれば取り消し、feedback と feedbackAt を null にする', () => {
      const digest = digestOf();
      const { digestItemId } = digest.items[0]!;
      const first = Digest.giveFeedback(digest, digestItemId, 'interested', now);
      if (!first.ok) throw new Error('unexpected');

      const second = Digest.giveFeedback(first.val.aggregateState, digestItemId, 'interested', later);

      expect(second.ok && second.val.eventPayload).toEqual({ digestItemId, feedback: null, feedbackAt: null });
      expect(second.ok && second.val.aggregateState.items[0]).toMatchObject({ feedback: null, feedbackAt: null });
    });

    it('digest に無い項目は DigestItemNotFoundError にする', () => {
      const missing = DigestItemId.generate();

      const given = Digest.giveFeedback(digestOf(), missing, 'interested', later);

      expect(given).toEqual({ ok: false, err: DigestItemNotFoundError.create(missing) });
    });
  });

  it('feedback は interested と not_interested だけを受け付ける', () => {
    const invalid = { ...payload(), items: [{ ...payload().items[0]!, feedback: 'maybe' as never }] };

    expect(Digest.create(invalid, now).ok).toBe(false);
  });
});
