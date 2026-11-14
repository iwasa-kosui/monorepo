import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { retireLocalAccount } from '../../../domain/user/retireLocalAccount.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import { createD1LocalAccountRetiredStore } from '../user/localAccountRetiredStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const count = (fixture: ReturnType<typeof createSqliteD1Fixture>, sql: string, ...params: string[]): number =>
  Number((fixture.sqlite.prepare(sql).get(...params) as { n: number | bigint }).n);

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const owner = seed.addLocalActor('kosui');
  const bot = seed.addLocalActor('iori_bot');
  const remote = seed.addRemoteActor('alice');
  return { fixture, seed, owner, bot, remote, store: createD1LocalAccountRetiredStore(fixture.db) };
};

const retire = (bot: { userId: string; actorId: string; username: string }) =>
  retireLocalAccount(Instant.orThrow(1_000))({
    userId: UserId.orThrow(bot.userId),
    username: Username.orThrow(bot.username),
    actorId: ActorId.orThrow(bot.actorId),
  });

describe('createD1LocalAccountRetiredStore', () => {
  it('アカウントの投稿・反応・フォロー・通知を消し、ほかの人のデータは残す', async () => {
    const { fixture, seed, owner, bot, remote, store } = setup();
    const botPost = seed.addLocalPost(bot, 10);
    const ownerPost = seed.addLocalPost(owner, 20);
    const remotePost = seed.addRemotePost(remote, 30, { timeline: true });
    // 持ち主が bot の投稿にした反応
    const ownerLike = seed.addLike(owner.actorId, botPost.postId);
    fixture.sqlite.prepare('INSERT INTO local_likes(likeId) VALUES (?)').run(ownerLike.likeId);
    seed.addBookmark(owner.actorId, botPost.postId);
    seed.addRepost(remote.actorId, botPost.postId, 40);
    seed.addImage(botPost.postId, 'https://iori.test/image.png');
    seed.addLinkPreview(botPost.postId, 'https://example.com', null, null);
    // bot がした反応
    const botLike = seed.addLike(bot.actorId, ownerPost.postId);
    fixture.sqlite.prepare('INSERT INTO local_likes(likeId) VALUES (?)').run(botLike.likeId);
    seed.addRepost(bot.actorId, remotePost.postId, 50);
    seed.addEmojiReact(bot.actorId, ownerPost.postId, ':wave:');
    // フォローと通知
    seed.addFollow(remote.actorId, bot.actorId);
    seed.addFollow(bot.actorId, remote.actorId);
    seed.addFollow(owner.actorId, remote.actorId);
    const botLikedOwner = seed.addLikeNotification(owner.userId, bot.actorId, ownerPost.postId, 60);
    const remoteLikedOwner = seed.addLikeNotification(owner.userId, remote.actorId, ownerPost.postId, 70);
    seed.addFollowNotification(bot.userId, remote.actorId, 80);
    seed.addReplyNotification(bot.userId, remote.actorId, remotePost.postId, botPost.postId, 90);
    seed.setMarker(owner.userId, 'notifications', botLikedOwner);
    fixture.sqlite.prepare('INSERT INTO keys(keyId,userId,type,privateKey,publicKey) VALUES (?,?,?,?,?)')
      .run(seed.uuid(), bot.userId, 'RSASSA-PKCS1-v1_5', '{}', '{}');

    await store.store(retire(bot));

    expect(count(fixture, 'SELECT count(*) n FROM users WHERE userId = ?', bot.userId)).toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM actors WHERE actorId = ?', bot.actorId)).toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM keys WHERE userId = ?', bot.userId)).toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM posts WHERE actorId = ?', bot.actorId)).toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM likes')).toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM reposts')).toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM emoji_reacts')).toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM bookmarks')).toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM follows WHERE ? IN (followerId, followingId)', bot.actorId))
      .toBe(0);
    expect(count(fixture, 'SELECT count(*) n FROM notifications WHERE recipientUserId = ?', bot.userId)).toBe(0);
    // ほかの人のデータは残す
    expect(count(fixture, 'SELECT count(*) n FROM posts WHERE postId IN (?, ?)', ownerPost.postId, remotePost.postId))
      .toBe(2);
    expect(count(fixture, 'SELECT count(*) n FROM follows WHERE followerId = ?', owner.actorId)).toBe(1);
    expect(
      fixture.sqlite.prepare('SELECT notificationId FROM notifications WHERE recipientUserId = ?').all(owner.userId),
    ).toEqual([{ notificationId: remoteLikedOwner }]);
    expect(count(fixture, 'SELECT count(*) n FROM timeline_items WHERE postId = ?', remotePost.postId)).toBe(1);
    // 既読の位置が消した通知を指したまま残らない（前の通知が無ければ位置を消す）
    expect(fixture.sqlite.prepare('SELECT lastReadId FROM mastodon_markers WHERE userId = ?').get(owner.userId))
      .toBeUndefined();
    expect(count(fixture, 'SELECT count(*) n FROM domain_events WHERE eventName = \'user.localAccountRetired\''))
      .toBe(1);
  });

  it('消せないデータが残っていれば、何も消さない（途中まで消えたアカウントを残さない）', async () => {
    const { fixture, bot, store } = setup();
    // bot は記事を持たないので、記事は消す対象にしていない
    fixture.sqlite.prepare(
      'INSERT INTO articles(articleId,authorActorId,authorUserId,title,status,createdAt) VALUES (?,?,?,?,?,?)',
    ).run('00000000-0000-4000-8000-ffffffffffff', bot.actorId, bot.userId, 'title', 'draft', 1);

    await expect(store.store(retire(bot))).rejects.toThrow();

    expect(count(fixture, 'SELECT count(*) n FROM users WHERE userId = ?', bot.userId)).toBe(1);
  });
});
