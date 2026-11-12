import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1PrunableRemotePostIdsResolverByReceivedBefore } from '../../adaptor/d1/post/prunableRemotePostIdsResolverByReceivedBefore.ts';
import { createD1RemotePostsPrunedStore } from '../../adaptor/d1/post/remotePostsPrunedStore.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import { PruneFederatedPostsUseCase } from '../pruneFederatedPosts.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 0, 0));
const OLD = NOW - 8 * DAY_MS;
const RECENT = NOW - 6 * DAY_MS;

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const { sqlite } = fixture;
  const local = seed.addLocalActor('kosui');
  const remote = seed.addRemoteActor('alice');
  const relayId = seed.addRelay();
  const addReceived = (receivedAt: number, createdAt = receivedAt, options: { inReplyToUri?: string } = {}) => {
    const post = seed.addRemotePost(remote, createdAt, options);
    seed.addFederatedItem(post.postId, relayId, receivedAt);
    return post;
  };
  const postIds = () => sqlite.prepare('SELECT postId FROM posts ORDER BY postId').all().map((row) => row.postId);
  const count = (table: string) =>
    (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number | bigint }).n;
  const useCase = PruneFederatedPostsUseCase.create({
    prunableRemotePostIdsResolverByReceivedBefore: createD1PrunableRemotePostIdsResolverByReceivedBefore(fixture.db),
    remotePostsPrunedStore: createD1RemotePostsPrunedStore(fixture.db),
    now: () => NOW,
  });
  return { sqlite, seed, local, remote, relayId, addReceived, postIds, count, useCase };
};

describe('PruneFederatedPostsUseCase', () => {
  it('受信から 7 日より前の投稿と、その子の行を消す', async () => {
    const { sqlite, seed, local, remote, addReceived, postIds, count, useCase } = setup();
    const target = addReceived(OLD, OLD, { inReplyToUri: 'https://remote.example/notes/other' });
    sqlite.prepare('INSERT INTO remote_post_recipients(postId,actorUri) VALUES (?,?)')
      .run(target.postId, 'https://remote.example/users/bob');
    sqlite.prepare('INSERT INTO post_quotes(postId,quoteUri) VALUES (?,?)')
      .run(target.postId, 'https://remote.example/notes/quoted');
    seed.addTimelineItem(remote.actorId, target.postId, OLD, { deletedAt: OLD + 1 });
    const remoteLike = seed.addLike(remote.actorId, target.postId);
    sqlite.prepare('UPDATE likes SET type = ? WHERE likeId = ?').run('remote', remoteLike.likeId);
    sqlite.prepare('INSERT INTO remote_likes(likeId,likeActivityUri) VALUES (?,?)')
      .run(remoteLike.likeId, 'https://remote.example/likes/1');
    seed.addEmojiReact(remote.actorId, target.postId, ':wave:');
    seed.addRepost(remote.actorId, target.postId, OLD, { timeline: false });
    seed.addImage(target.postId, 'https://remote.example/a.png');
    seed.addLinkPreview(target.postId, 'https://example.com/a', null, null);
    sqlite.prepare(
      'INSERT INTO post_translations(postId,targetLanguage,sourceHash,content,detectedSourceLanguage,model,createdAt) VALUES (?,?,?,?,?,?,?)',
    ).run(target.postId, 'ja', 'hash', 'content', 'en', 'model', 1);
    const localPost = seed.addLocalPost(local, OLD);
    sqlite.prepare(
      'INSERT INTO domain_events(eventId,aggregateId,aggregateName,aggregateState,eventName,eventPayload,occurredAt) VALUES (?,?,?,?,?,?,?)',
    ).run(seed.uuid(), target.postId, 'post', null, 'post.remotePostCreated', '{}', 1);

    const result = await useCase.run();

    expect(result).toMatchObject({ ok: true, val: { pruned: 1 } });
    expect(postIds()).toEqual([localPost.postId]);
    for (
      const table of [
        'federated_timeline_items',
        'remote_likes',
        'emoji_reacts',
        'reposts',
        'post_images',
        'remote_post_recipients',
        'post_quotes',
        'remote_posts',
        'post_translations',
        'link_previews',
      ]
    ) expect(count(table)).toBe(0);
    expect(sqlite.prepare('SELECT postId FROM timeline_items').all()).toEqual([{ postId: localPost.postId }]);
    expect(sqlite.prepare('SELECT postId FROM likes').all()).toEqual([]);
    expect(count('domain_events')).toBe(1);
  });

  it('受信から 7 日以内の投稿と、作成は古いが受信が新しい投稿を残す', async () => {
    const { seed, addReceived, postIds, useCase } = setup();
    const boundary = addReceived(NOW - 7 * DAY_MS);
    const recent = addReceived(RECENT);
    const createdOld = addReceived(RECENT, OLD - DAY_MS);
    const receivedAgain = addReceived(OLD);
    seed.addFederatedItem(receivedAgain.postId, seed.addRelay(), RECENT);
    const createdRecent = addReceived(OLD, RECENT);

    const result = await useCase.run();

    expect(result).toMatchObject({ ok: true, val: { pruned: 1 } });
    expect(postIds()).toEqual(
      [boundary.postId, recent.postId, createdOld.postId, receivedAgain.postId].sort(),
    );
    expect(postIds()).not.toContain(createdRecent.postId);
  });

  it('ローカル投稿と、federated の行が無いリモート投稿を残す', async () => {
    const { seed, local, remote, relayId, postIds, useCase } = setup();
    const localPost = seed.addLocalPost(local, OLD);
    seed.addFederatedItem(localPost.postId, relayId, OLD);
    const noFederated = seed.addRemotePost(remote, OLD);

    const result = await useCase.run();

    expect(result).toMatchObject({ ok: true, val: { pruned: 0 } });
    expect(postIds()).toEqual([localPost.postId, noFederated.postId].sort());
  });

  describe('除外条件', () => {
    type Context = ReturnType<typeof setup> & { post: { postId: string; uri: string } };
    const cases: ReadonlyArray<readonly [string, (context: Context) => void]> = [
      ['ローカルのいいねがある', ({ seed, local, post }) => seed.addLike(local.actorId, post.postId)],
      [
        'ローカルの絵文字リアクションがある',
        ({ seed, local, post }) => seed.addEmojiReact(local.actorId, post.postId, ':wave:'),
      ],
      ['ローカルのブックマークがある', ({ seed, local, post }) => seed.addBookmark(local.actorId, post.postId)],
      [
        '(a) 論理削除されていない timeline_items がある',
        ({ seed, local, post }) => seed.addTimelineItem(local.actorId, post.postId, OLD),
      ],
      [
        '(b) ローカルの repost がある',
        ({ seed, local, post }) => seed.addRepost(local.actorId, post.postId, OLD, { timeline: false }),
      ],
      [
        '(c) ローカル投稿がこの投稿に返信している',
        ({ seed, local, post }) => seed.addLocalPost(local, OLD, { inReplyToUri: post.uri }),
      ],
      [
        '(d) いいねの通知が指している',
        ({ seed, local, remote, post }) => seed.addLikeNotification(local.userId, remote.actorId, post.postId, 1),
      ],
      [
        '(d) repost の通知が指している',
        ({ seed, local, remote, post }) => seed.addRepostNotification(local.userId, remote.actorId, post.postId, 1),
      ],
      [
        '(d) 絵文字リアクションの通知が指している',
        ({ seed, local, remote, post }) => seed.addEmojiReactNotification(local.userId, remote.actorId, post.postId, 1),
      ],
      [
        '(d) 返信の通知が replyPostId で指している',
        ({ seed, local, remote, post }) =>
          seed.addReplyNotification(local.userId, remote.actorId, post.postId, seed.uuid(), 1),
      ],
      [
        '(d) 返信の通知が originalPostId で指している',
        ({ seed, local, remote, post }) =>
          seed.addReplyNotification(local.userId, remote.actorId, seed.uuid(), post.postId, 1),
      ],
      [
        '(d) メンションの通知が指している',
        ({ seed, local, remote, post }) => seed.addMentionNotification(local.userId, remote.actorId, post.postId, 1),
      ],
      [
        '(e) article の rootPostId が指している',
        ({ sqlite, seed, local, post }) =>
          sqlite.prepare(
            'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
          ).run(seed.uuid(), local.actorId, local.userId, post.postId, 'title', 'draft', 1, null, null),
      ],
    ];

    it.each(cases)('%s と残る', async (_name, attach) => {
      const context = setup();
      const post = context.addReceived(OLD);
      attach({ ...context, post });

      const result = await context.useCase.run();

      expect(result).toMatchObject({ ok: true, val: { pruned: 0 } });
      expect(context.postIds()).toContain(post.postId);
    });

    it('(c) この投稿がローカル投稿への返信であれば残る', async () => {
      const { seed, local, addReceived, postIds, useCase } = setup();
      const parent = seed.addLocalPost(local, OLD);
      const reply = addReceived(OLD, OLD, { inReplyToUri: parent.uri });
      const other = addReceived(OLD, OLD, { inReplyToUri: 'https://remote.example/notes/other' });

      const result = await useCase.run();

      expect(result).toMatchObject({ ok: true, val: { pruned: 1 } });
      expect(postIds()).toContain(reply.postId);
      expect(postIds()).not.toContain(other.postId);
    });
  });

  it('1 回の取得件数より多い投稿も、続けて消す', async () => {
    const { seed, local, addReceived, postIds, count, useCase } = setup();
    for (let index = 0; index < 120; index += 1) addReceived(OLD - index);
    const recent = addReceived(RECENT);
    const localPost = seed.addLocalPost(local, OLD);

    const result = await useCase.run();

    expect(result).toMatchObject({ ok: true, val: { pruned: 120 } });
    expect(postIds()).toEqual([recent.postId, localPost.postId].sort());
    expect(count('remote_posts')).toBe(1);
    expect(count('federated_timeline_items')).toBe(1);
  });

  it('選んだ後にローカルのいいねが付いた投稿は、batch ごと削除に失敗して残る', async () => {
    const fixture = createSqliteD1Fixture();
    const seed = createMastodonSeed(fixture);
    const local = seed.addLocalActor('kosui');
    const remote = seed.addRemoteActor('alice');
    const relayId = seed.addRelay();
    const liked = seed.addRemotePost(remote, OLD);
    const other = seed.addRemotePost(remote, OLD);
    for (const post of [liked, other]) seed.addFederatedItem(post.postId, relayId, OLD);
    seed.addLike(local.actorId, liked.postId);
    const store = createD1RemotePostsPrunedStore(fixture.db);

    await expect(store.store([PostId.orThrow(liked.postId), PostId.orThrow(other.postId)])).rejects.toThrow();

    expect(fixture.sqlite.prepare('SELECT postId FROM posts ORDER BY postId').all()).toHaveLength(2);
    expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM federated_timeline_items').get()).toEqual({ n: 2 });
  });
});
