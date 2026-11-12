import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../src/adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../src/adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1PrunableRemotePostIdsResolverByReceivedBefore } from '../../src/adaptor/d1/post/prunableRemotePostIdsResolverByReceivedBefore.ts';
import { Instant } from '../../src/domain/instant/instant.ts';
import { candidateSql, cutoffOf, dryRunSql, REASONS } from '../prune-federated-posts.mjs';

const now = 1_800_000_000_000;
const cutoff = cutoffOf(now);
const old = cutoff - 1_000;
const recent = cutoff + 1_000;

const build = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const { sqlite } = fixture;
  const local = seed.addLocalActor('alice');
  const remote = seed.addRemoteActor('bob');
  const relayA = seed.addRelay();
  const relayB = seed.addRelay();
  const federated = (receivedAt: number | number[] = old, options: { inReplyToUri?: string } = {}) => {
    const post = seed.addRemotePost(remote, now, options);
    [receivedAt].flat().forEach((at, index) => seed.addFederatedItem(post.postId, index === 0 ? relayA : relayB, at));
    return post;
  };
  const setReplyTo = (postId: string, uri: string) =>
    sqlite.prepare('UPDATE remote_posts SET inReplyToUri = ? WHERE postId = ?').run(uri, postId);

  const unreferenced = [
    federated(),
    federated(),
    federated([old, old - 5]),
    federated(old - 10),
    federated(old, { inReplyToUri: 'https://remote.example/notes/elsewhere' }),
  ];
  const remoteLike = unreferenced[1];
  sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
    seed.uuid(),
    remote.actorId,
    remoteLike.postId,
    'remote',
    1,
  );
  seed.addEmojiReact(remote.actorId, unreferenced[2].postId, ':wave:');
  seed.addTimelineItem(remote.actorId, unreferenced[3].postId, 1, { deletedAt: 2 });
  seed.addRepost(remote.actorId, unreferenced[4].postId, 1, { timeline: false });

  const localTarget = seed.addLocalPost(local, 1, { timeline: false });
  const suffix = localTarget.uri.slice(localTarget.uri.indexOf('/users/'));
  const referenced = {
    local_likes: federated(),
    local_emoji: federated(),
    home: federated(),
    local_repost: federated(),
    replied: federated(),
    repliesToLocal: federated(),
    repliesToLocalFromOtherOrigin: federated(),
    notificationLike: federated(),
    notificationRepost: federated(),
    notificationEmoji: federated(),
    notificationReply: federated(),
    notificationOriginal: federated(),
    notificationMention: federated(),
    article: federated(),
    overlap: federated(),
  };
  seed.addLike(local.actorId, referenced.local_likes.postId);
  seed.addEmojiReact(local.actorId, referenced.local_emoji.postId, ':wave:');
  seed.addTimelineItem(remote.actorId, referenced.home.postId, 1);
  seed.addRepost(local.actorId, referenced.local_repost.postId, 1, { timeline: false });
  seed.addLocalPost(local, 1, { inReplyToUri: referenced.replied.uri, timeline: false });
  setReplyTo(referenced.repliesToLocal.postId, localTarget.uri);
  setReplyTo(referenced.repliesToLocalFromOtherOrigin.postId, `https://other.example${suffix}`);
  seed.addLikeNotification(local.userId, remote.actorId, referenced.notificationLike.postId, 1);
  seed.addRepostNotification(local.userId, remote.actorId, referenced.notificationRepost.postId, 1);
  seed.addEmojiReactNotification(local.userId, remote.actorId, referenced.notificationEmoji.postId, 1);
  const replyTarget = seed.addLocalPost(local, 1, { timeline: false });
  seed.addReplyNotification(
    local.userId,
    remote.actorId,
    referenced.notificationReply.postId,
    replyTarget.postId,
    1,
  );
  seed.addReplyNotification(
    local.userId,
    remote.actorId,
    replyTarget.postId,
    referenced.notificationOriginal.postId,
    1,
  );
  seed.addMentionNotification(local.userId, remote.actorId, referenced.notificationMention.postId, 1);
  sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(seed.uuid(), local.actorId, local.userId, referenced.article.postId, 't', 'draft', 1, null, null);
  seed.addLike(local.actorId, referenced.overlap.postId);
  seed.addTimelineItem(remote.actorId, referenced.overlap.postId, 1);

  const keptRecent = [federated(cutoff), federated(recent), federated([old, recent])];
  return { fixture, unreferenced, referenced, keptRecent };
};

describe('prune-federated-posts dry-run and the Cron resolver', () => {
  it('select the same posts', async () => {
    const { fixture, unreferenced, referenced, keptRecent } = build();
    const all = (sql: string) => fixture.sqlite.prepare(sql).all() as Array<Record<string, unknown>>;

    const dryRun = all(dryRunSql(cutoff))[0];
    const dryRunIds = all(
      `SELECT c.postId AS postId FROM (${candidateSql(cutoff)}) c WHERE ${
        Object.values(REASONS).map((reason) => `${reason} = 0`).join(' AND ')
      }`,
    ).map((row) => String(row.postId));

    const resolved = await createD1PrunableRemotePostIdsResolverByReceivedBefore(fixture.db).resolve({
      receivedBefore: Instant.orThrow(cutoff),
      limit: 10_000,
    });
    if (!resolved.ok) throw new Error('resolver failed');
    const resolverIds = resolved.val.map(String);

    const expected = unreferenced.map((post) => post.postId).sort();
    expect(expected.length).toBeGreaterThan(1);
    expect(dryRun.candidates).toBe(expected.length + Object.keys(referenced).length);
    expect(dryRun.to_delete).toBe(resolverIds.length);
    expect([...dryRunIds].sort()).toEqual([...resolverIds].sort());
    expect([...resolverIds].sort()).toEqual(expected);
    for (const post of [...Object.values(referenced), ...keptRecent]) {
      expect(resolverIds).not.toContain(post.postId);
    }
  });
});
