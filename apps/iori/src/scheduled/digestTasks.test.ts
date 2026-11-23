import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed } from '../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { PostId } from '../domain/post/postId.ts';
import {
  createDailyDigestTask,
  removeExpiredDigestXPostsTask,
  removeExpiredDigestXPostsTaskFrom,
} from './digestTasks.ts';
import type { ScheduledTaskContext } from './scheduledTasks.ts';

const DAY = 24 * 60 * 60 * 1000;

const setup = (env: Record<string, unknown> = {}) => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const context = {
    env: { DB: fixture.binding, ...env },
    scheduledTime: new Date(),
    waitUntil: () => undefined,
  } as unknown as ScheduledTaskContext;
  const addDigestWithXPosts = (createdAt: number) => {
    const digestId = seed.uuid();
    const xPostsPostId = PostId.generate();
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,postId,xPostsPostId,createdAt,trigger,topicKey) VALUES (?,?,?,?,?,?,?,?)',
    ).run(digestId, me.userId, '2026-11-01', PostId.generate(), xPostsPostId, createdAt, 'scheduled', 'summary');
    return { digestId, xPostsPostId };
  };
  const xPostsPostIds = () =>
    fixture.sqlite.prepare('SELECT xPostsPostId FROM digests ORDER BY digestId').all() as Array<
      { xPostsPostId: string | null }
    >;
  return { fixture, context, addDigestWithXPosts, xPostsPostIds };
};

afterEach(() => vi.restoreAllMocks());

describe('bot が無効なとき', () => {
  it('毎日の digest の生成も、期限切れの X 投稿の削除も、警告を出して何もしない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = setup({ IORI_AI_AGENT_BOT: undefined });
    t.addDigestWithXPosts(Date.now() - 30 * DAY);

    await createDailyDigestTask.run(t.context);
    await removeExpiredDigestXPostsTask.run(t.context);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(t.xPostsPostIds().map((row) => row.xPostsPostId)).not.toContain(null);
    expect(t.fixture.sqlite.prepare('SELECT count(*) AS n FROM digests').get()).toEqual({ n: 1 });
  });
});

describe('removeExpiredDigestXPostsTask', () => {
  it('保存期間を過ぎた digest の X 投稿の返信を削除し、保存期間内のものは残す', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const t = setup();
    const expired = t.addDigestWithXPosts(Date.now() - 30 * DAY);
    const recent = t.addDigestWithXPosts(Date.now() - DAY);
    const deletePost = vi.fn(async () => Result.ok(undefined));
    const task = removeExpiredDigestXPostsTaskFrom(async () => ({
      dmSender: {
        sendSummary: async () => Result.err('unused'),
        sendReply: async () => Result.err('unused'),
      },
      deletePost,
    }));

    await task.run(t.context);

    expect(deletePost).toHaveBeenCalledExactlyOnceWith(expired.xPostsPostId);
    expect(
      t.fixture.sqlite.prepare('SELECT digestId, xPostsPostId FROM digests ORDER BY digestId').all(),
    ).toEqual(
      [
        { digestId: expired.digestId, xPostsPostId: null },
        { digestId: recent.digestId, xPostsPostId: recent.xPostsPostId },
      ].sort((a, b) => (a.digestId < b.digestId ? -1 : 1)),
    );
  });
});
