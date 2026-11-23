import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { UserId } from '../user/userId.ts';
import { Digest } from './digest.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));

const payload = () => ({
  userId: UserId.generate(),
  digestDate: '2026-11-05',
  postId: PostId.generate(),
  xPostsPostId: PostId.generate() as PostId | null,
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
  }],
  trends: [{ kind: 'hatena' as const, rank: 1, url: 'https://example.com/h', title: 'H', count: 10 }],
  xPostFeedEntryIds: ['x-1', 'x-2'],
});

const digestOf = (overrides: Partial<ReturnType<typeof payload>> = {}) => {
  const created = Digest.create({ ...payload(), ...overrides }, now);
  if (!created.ok) throw new Error('unexpected');
  return created.val.aggregateState;
};

describe('Digest', () => {
  describe('create', () => {
    it('DM の postId と X 投稿の返信の postId を持つ digest を digest.created として返す', () => {
      const input = payload();

      const created = Digest.create(input, now);

      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.val).toMatchObject({
        aggregateName: 'digest',
        eventName: 'digest.created',
        aggregateState: { postId: input.postId, xPostsPostId: input.xPostsPostId, createdAt: now },
      });
    });

    it('X 投稿の返信が無い digest は xPostsPostId を null にできる', () => {
      expect(digestOf({ xPostsPostId: null }).xPostsPostId).toBeNull();
    });
  });

  describe('removeXPosts', () => {
    it('xPostsPostId を null にした状態の digest.xPostsRemoved を返し、ほかの値は変えない', () => {
      const digest = digestOf();
      const later = Instant.addDuration(now, 1000);

      const removed = Digest.removeXPosts(digest, later);

      expect(removed).toMatchObject({
        aggregateName: 'digest',
        eventName: 'digest.xPostsRemoved',
        eventPayload: { digestId: digest.digestId },
        occurredAt: later,
      });
      expect(removed.aggregateState).toEqual({ ...digest, xPostsPostId: null });
    });
  });

  describe('expire', () => {
    it('状態を持たない digest.expired を、digest の ID と日付つきで返す', () => {
      const digest = digestOf();

      const expired = Digest.expire(digest, now);

      expect(expired).toMatchObject({
        aggregateName: 'digest',
        eventName: 'digest.expired',
        aggregateState: undefined,
        eventPayload: { digestId: digest.digestId, digestDate: digest.digestDate },
      });
    });
  });
});
