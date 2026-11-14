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
});
