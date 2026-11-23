import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import {
  Digest,
  type DigestsResolverByXPostsCreatedBefore,
  type DigestXPostsRemovedStore,
} from '../../domain/digest/digest.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { X_USER_RETENTION_DAYS } from '../fetchXUserItems.ts';
import { RemoveExpiredDigestXPostsUseCase } from '../removeExpiredDigestXPosts.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 20, 21, 30));
const userId = UserId.generate();

const setup = (options: { failingPostIds?: ReadonlySet<PostId> } = {}) => {
  let digests: Digest[] = [];
  const livePosts = new Set<PostId>();
  const removedEvents: string[] = [];
  const digestsResolverByXPostsCreatedBefore: DigestsResolverByXPostsCreatedBefore = {
    resolve: ({ createdBefore }) =>
      RA.ok(digests.filter((digest) => digest.xPostsPostId !== null && digest.createdAt < createdBefore)),
  };
  const digestXPostsRemovedStore: DigestXPostsRemovedStore = {
    store: (...events) => {
      for (const event of events) {
        digests = digests.map((digest) =>
          digest.digestId === event.aggregateState.digestId ? event.aggregateState : digest
        );
        removedEvents.push(event.eventName);
      }
      return RA.ok(undefined);
    },
  };
  const addDigest = (createdAt: number, withXPosts = true) => {
    const postId = PostId.generate();
    const xPostsPostId = withXPosts ? PostId.generate() : null;
    const created = Digest.create({
      userId,
      digestDate: '2026-11-01',
      postId,
      xPostsPostId,
      trigger: 'scheduled',
      topicKey: 'summary',
      items: [],
      trends: [],
      xPostFeedEntryIds: [],
    }, Instant.orThrow(createdAt));
    if (!created.ok) throw new Error('unexpected parse error');
    digests.push(created.val.aggregateState);
    if (xPostsPostId !== null) livePosts.add(xPostsPostId);
    return { digestId: created.val.aggregateState.digestId, xPostsPostId };
  };
  const deletePost = vi.fn(async (postId: PostId): Promise<Result<void, string>> => {
    if (options.failingPostIds?.has(postId)) return Result.err('delete failed');
    livePosts.delete(postId);
    return Result.ok(undefined);
  });
  const useCase = RemoveExpiredDigestXPostsUseCase.create({
    digestsResolverByXPostsCreatedBefore,
    digestXPostsRemovedStore,
    deletePost,
    now: () => NOW,
  });
  return {
    addDigest,
    useCase,
    livePosts,
    removedEvents,
    xPostsPostIdOf: (digestId: string) => digests.find((digest) => digest.digestId === digestId)?.xPostsPostId,
  };
};

describe('RemoveExpiredDigestXPostsUseCase', () => {
  it('保存期間を過ぎた digest の X 投稿の返信だけを削除し、その digest の xPostsPostId を空にする', async () => {
    const t = setup();
    const expired = t.addDigest(NOW - (X_USER_RETENTION_DAYS + 1) * DAY);
    const recent = t.addDigest(NOW - (X_USER_RETENTION_DAYS - 1) * DAY);
    const withoutXPosts = t.addDigest(NOW - 30 * DAY, false);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { removed: 1, failed: 0 } });
    expect(t.xPostsPostIdOf(expired.digestId)).toBeNull();
    expect(t.xPostsPostIdOf(recent.digestId)).toBe(recent.xPostsPostId);
    expect(t.xPostsPostIdOf(withoutXPosts.digestId)).toBeNull();
    expect([...t.livePosts]).toEqual([recent.xPostsPostId]);
    expect(t.removedEvents).toEqual(['digest.xPostsRemoved']);
  });

  it('削除に失敗した digest は xPostsPostId を残し、ほかの digest の削除は続け、次の実行でもう一度試す', async () => {
    const failingIds = new Set<PostId>();
    const t = setup({ failingPostIds: failingIds });
    const failing = t.addDigest(NOW - 10 * DAY);
    const succeeding = t.addDigest(NOW - 9 * DAY);
    failingIds.add(failing.xPostsPostId!);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const firstRun = await t.useCase.run();

    expect(firstRun).toEqual({ ok: true, val: { removed: 1, failed: 1 } });
    expect(t.xPostsPostIdOf(failing.digestId)).toBe(failing.xPostsPostId);
    expect(t.xPostsPostIdOf(succeeding.digestId)).toBeNull();
    expect(t.removedEvents).toEqual(['digest.xPostsRemoved']);

    failingIds.clear();
    const secondRun = await t.useCase.run();

    expect(secondRun).toEqual({ ok: true, val: { removed: 1, failed: 0 } });
    expect(t.xPostsPostIdOf(failing.digestId)).toBeNull();
  });
});
