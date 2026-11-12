import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1DirectMessageActorsResolverByUris } from '../fediverseConversation/directMessageActorsResolverByUris.ts';
import { createD1DirectMessageNotificationsReadMarker } from '../fediverseConversation/directMessageNotificationsReadMarker.ts';
import { createD1DirectMessagePostsResolver } from '../fediverseConversation/directMessagePostsResolver.ts';
import { createMastodonSeed, SEED_ORIGIN } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const kosuiUri = `${SEED_ORIGIN}/users/kosui`;
const hanakoUri = `${SEED_ORIGIN}/users/hanako`;
const aliceUri = 'https://remote.example/users/alice';
const bobUri = 'https://other.example/users/bob';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const kosui = seed.addLocalActor('kosui');
  const hanako = seed.addLocalActor('hanako');
  const alice = seed.addRemoteActor('alice');
  const bob = seed.addRemoteActor('bob', 'other.example');
  const participate = (postId: string, uris: ReadonlyArray<string>) => {
    for (const uri of uris) {
      fixture.sqlite.prepare('INSERT INTO direct_post_participants(postId,actorUri) VALUES (?,?)').run(postId, uri);
    }
  };
  const remoteDirect = (
    author: { actorId: string },
    createdAt: number,
    participants: ReadonlyArray<string>,
    recipients: ReadonlyArray<string> = participants,
  ) => {
    const post = seed.addRemotePost(author, createdAt, {
      visibility: 'direct',
      recipientActorUris: recipients,
      timeline: false,
    });
    participate(post.postId, participants);
    return post.postId;
  };
  const localDirect = (author: typeof kosui, createdAt: number, participants: ReadonlyArray<string>) => {
    const post = seed.addLocalPost(author, createdAt, { visibility: 'direct', timeline: false });
    participate(post.postId, participants);
    return post.postId;
  };
  const viewer = {
    userId: UserId.orThrow(kosui.userId),
    actorId: ActorId.orThrow(kosui.actorId),
    actorUri: kosuiUri,
  };
  const resolver = createD1DirectMessagePostsResolver(fixture.db);
  const resolve = async (condition: Partial<Parameters<typeof resolver.resolve>[0]> = {}) => {
    const resolved = await resolver.resolve({ viewer, limit: 50, ...condition });
    if (!resolved.ok) throw new Error('unreachable');
    return resolved.val;
  };
  return { ...fixture, seed, kosui, hanako, alice, bob, viewer, remoteDirect, localDirect, participate, resolve };
};

const idsOf = (posts: ReadonlyArray<{ postId: string }>) => posts.map((post) => post.postId);

describe('direct の投稿の一覧', () => {
  it('閲覧者が参加している direct の投稿だけを、新しい順に返す', async () => {
    const t = setup();
    const fromAlice = t.remoteDirect(t.alice, 1000, [aliceUri, kosuiUri]);
    const toAlice = t.localDirect(t.kosui, 2000, [kosuiUri, aliceUri]);
    t.remoteDirect(t.bob, 3000, [bobUri, hanakoUri]);

    const posts = await t.resolve();

    expect(idsOf(posts)).toEqual([toAlice, fromAlice]);
    expect(posts[0]).toMatchObject({
      authorUri: kosuiUri,
      createdAt: 2000,
      participantUris: expect.arrayContaining([kosuiUri, aliceUri]),
    });
  });

  it('参加者を持たない public の投稿と、参加者の記録が無い direct の投稿を含めない', async () => {
    const t = setup();
    t.seed.addRemotePost(t.alice, 1000, { visibility: 'public', recipientActorUris: [kosuiUri] });
    t.seed.addRemotePost(t.alice, 2000, { visibility: 'direct', recipientActorUris: [kosuiUri] });
    t.seed.addLocalPost(t.kosui, 3000, { visibility: 'public' });

    expect(await t.resolve()).toEqual([]);
  });

  it('閲覧者が参加者に入っていても、閲覧できない他のユーザーの direct の投稿を含めない', async () => {
    const t = setup();
    t.localDirect(t.hanako, 1000, [hanakoUri, kosuiUri]);
    t.remoteDirect(t.alice, 2000, [aliceUri, kosuiUri], [aliceUri]);

    expect(await t.resolve()).toEqual([]);
  });

  it('削除済みの投稿を含めない', async () => {
    const t = setup();
    const postId = t.remoteDirect(t.alice, 1000, [aliceUri, kosuiUri]);
    t.sqlite.prepare('UPDATE posts SET deletedAt = ? WHERE postId = ?').run(5000, postId);

    expect(await t.resolve()).toEqual([]);
  });

  it('参加者の組がちょうど一致する投稿だけを会話として返す', async () => {
    const t = setup();
    const oneToOne = t.remoteDirect(t.alice, 1000, [aliceUri, kosuiUri]);
    const group = t.remoteDirect(t.alice, 2000, [aliceUri, bobUri, kosuiUri]);
    t.remoteDirect(t.bob, 3000, [bobUri, kosuiUri]);

    expect(idsOf(await t.resolve({ participantUris: [aliceUri] }))).toEqual([oneToOne]);
    expect(idsOf(await t.resolve({ participantUris: [bobUri, aliceUri] }))).toEqual([group]);
    expect(await t.resolve({ participantUris: [hanakoUri] })).toEqual([]);
  });

  it('before の位置より古い投稿だけを、同じ日時では postId の小さい順に返す', async () => {
    const t = setup();
    const first = t.remoteDirect(t.alice, 1000, [aliceUri, kosuiUri]);
    const second = t.remoteDirect(t.alice, 2000, [aliceUri, kosuiUri]);
    const third = t.remoteDirect(t.alice, 2000, [aliceUri, kosuiUri]);

    const newest = await t.resolve({ limit: 1 });
    expect(idsOf(newest)).toEqual([third]);
    const older = await t.resolve({
      before: { createdAt: newest[0]!.createdAt, postId: newest[0]!.postId },
      limit: 10,
    });
    expect(idsOf(older)).toEqual([second, first]);
  });

  it('limit までしか読まない', async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) t.remoteDirect(t.alice, 1000 + i, [aliceUri, kosuiUri]);

    expect(await t.resolve({ limit: 3 })).toHaveLength(3);
  });
});

describe('direct の投稿の未読', () => {
  it('閲覧者宛のメンションの通知が未読の投稿を unread にする', async () => {
    const t = setup();
    const unread = t.remoteDirect(t.alice, 1000, [aliceUri, kosuiUri]);
    const read = t.remoteDirect(t.alice, 2000, [aliceUri, kosuiUri]);
    t.seed.addMentionNotification(t.kosui.userId, t.alice.actorId, unread, 1000);
    const readNotification = t.seed.addMentionNotification(t.kosui.userId, t.alice.actorId, read, 2000);
    t.sqlite.prepare('UPDATE notifications SET isRead = 1 WHERE notificationId = ?').run(readNotification);

    const posts = await t.resolve();

    expect(posts.map((post) => [post.postId, post.unread])).toEqual([[read, false], [unread, true]]);
  });

  it('返信の通知が未読の投稿も unread にする', async () => {
    const t = setup();
    const mine = t.localDirect(t.kosui, 1000, [kosuiUri, aliceUri]);
    const reply = t.remoteDirect(t.alice, 2000, [aliceUri, kosuiUri]);
    t.seed.addReplyNotification(t.kosui.userId, t.alice.actorId, reply, mine, 2000);

    const posts = await t.resolve({ unreadOnly: true });

    expect(idsOf(posts)).toEqual([reply]);
  });

  it('他のユーザー宛の通知は未読に数えない', async () => {
    const t = setup();
    const postId = t.remoteDirect(t.alice, 1000, [aliceUri, kosuiUri]);
    t.seed.addMentionNotification(t.hanako.userId, t.alice.actorId, postId, 1000);

    expect(await t.resolve({ unreadOnly: true })).toEqual([]);
  });

  it('既読にすると、その投稿の通知だけが既読になる', async () => {
    const t = setup();
    const target = t.remoteDirect(t.alice, 1000, [aliceUri, kosuiUri]);
    const reply = t.remoteDirect(t.alice, 2000, [aliceUri, kosuiUri]);
    const other = t.remoteDirect(t.bob, 3000, [bobUri, kosuiUri]);
    const targetNotification = t.seed.addMentionNotification(t.kosui.userId, t.alice.actorId, target, 1000);
    const replyNotification = t.seed.addReplyNotification(t.kosui.userId, t.alice.actorId, reply, target, 2000);
    const otherNotification = t.seed.addMentionNotification(t.kosui.userId, t.bob.actorId, other, 3000);
    const hanakoNotification = t.seed.addMentionNotification(t.hanako.userId, t.alice.actorId, target, 1000);

    await createD1DirectMessageNotificationsReadMarker(t.db).markRead({
      userId: t.viewer.userId,
      postIds: [PostId.orThrow(target), PostId.orThrow(reply)],
    });

    const isRead = (id: string) =>
      (t.sqlite.prepare('SELECT isRead FROM notifications WHERE notificationId = ?').get(id) as { isRead: number })
        .isRead;
    expect([targetNotification, replyNotification, otherNotification, hanakoNotification].map(isRead)).toEqual([
      1,
      1,
      0,
      0,
    ]);
    expect(idsOf(await t.resolve({ unreadOnly: true }))).toEqual([other]);
  });

  it('投稿が無いときは何も更新しない', async () => {
    const t = setup();
    const postId = t.remoteDirect(t.alice, 1000, [aliceUri, kosuiUri]);
    const notification = t.seed.addMentionNotification(t.kosui.userId, t.alice.actorId, postId, 1000);

    await createD1DirectMessageNotificationsReadMarker(t.db).markRead({ userId: t.viewer.userId, postIds: [] });

    expect(
      (t.sqlite.prepare('SELECT isRead FROM notifications WHERE notificationId = ?').get(notification) as {
        isRead: number;
      }).isRead,
    ).toBe(0);
  });
});

describe('direct の投稿の相手の解決', () => {
  it('URI からアクターを引き、存在しない URI は含めない', async () => {
    const t = setup();

    const resolved = await createD1DirectMessageActorsResolverByUris(t.db).resolve([
      aliceUri,
      aliceUri,
      kosuiUri,
      'https://nowhere.example/users/none',
    ]);

    expect(resolved.ok && Object.fromEntries(resolved.val)).toEqual({
      [aliceUri]: { actorId: t.alice.actorId, uri: aliceUri, inboxUrl: `${aliceUri}/inbox`, type: 'remote' },
      [kosuiUri]: { actorId: t.kosui.actorId, uri: kosuiUri, inboxUrl: `${kosuiUri}/inbox`, type: 'local' },
    });
  });
});
