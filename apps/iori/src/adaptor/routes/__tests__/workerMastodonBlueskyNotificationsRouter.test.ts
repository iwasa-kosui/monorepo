import { describe, expect, it } from 'vitest';

import { GroupedNotificationsResultsSchema, NotificationSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';

const jsonHeaders = (bearer: Record<string, string>) => ({ ...bearer, 'Content-Type': 'application/json' });
const ALICE_ACCOUNT_ID = 'bluesky:did:plc:alice';
const LIKED_STATUS_ID = 'bluesky:at://did:plc:me/app.bsky.feed.post/3kpost';
const MENTION_STATUS_ID = 'bluesky:at://did:plc:alice/app.bsky.feed.post/3kreply';

const seedBluesky = async () => {
  const t = setupReadApi();
  const me = await t.signIn('read write');
  const alice = t.seed.addRemoteActor('alice');
  const myPost = t.seed.addLocalPost(me, 1_000);
  const followId = t.seed.addFollowNotification(me.userId, alice.actorId, 2_000);
  const bluesky = {
    like: t.seed.addBlueskyNotification(me.userId, 'blueskyLike', 7_000),
    repost: t.seed.addBlueskyNotification(me.userId, 'blueskyRepost', 7_100, { targetPostId: myPost.postId }),
    follow: t.seed.addBlueskyNotification(me.userId, 'blueskyFollow', 7_200),
    mention: t.seed.addBlueskyNotification(me.userId, 'blueskyMention', 7_300, {
      blueskyUri: 'at://did:plc:alice/app.bsky.feed.post/3kreply',
      reason: 'reply',
      subjectUri: null,
      text: 'hello',
    }),
  };
  const get = (path: string) => t.request(path, { headers: me.bearer });
  const post = (path: string) => t.request(path, { method: 'POST', headers: jsonHeaders(me.bearer) });
  const typesOf = async (response: Response) =>
    ((await response.json()) as Array<{ type: string }>).map((item) => item.type);
  return { ...t, me, alice, myPost, followId, bluesky, get, post, typesOf };
};

describe('Bluesky の通知の Mastodon 互換 API', () => {
  it('投稿に結び付かない通知は、合成した Account と最小の Status で返す', async () => {
    const t = await seedBluesky();

    const response = await t.get('/api/v1/notifications?limit=4');

    expect(response.status).toBe(200);
    const body = ((await response.json()) as unknown[]).map((item) => NotificationSchema.parse(item));
    expect(body.map((item) => [item.id, item.type, item.status?.id, item.account.id])).toEqual([
      [t.bluesky.mention, 'mention', MENTION_STATUS_ID, ALICE_ACCOUNT_ID],
      [t.bluesky.follow, 'follow', undefined, ALICE_ACCOUNT_ID],
      [t.bluesky.repost, 'reblog', t.myPost.postId, ALICE_ACCOUNT_ID],
      [t.bluesky.like, 'favourite', LIKED_STATUS_ID, ALICE_ACCOUNT_ID],
    ]);
    expect(body[0]?.status).toMatchObject({
      account: { id: ALICE_ACCOUNT_ID },
      content: '<p>hello</p>',
      url: 'https://bsky.app/profile/did:plc:alice/post/3kreply',
    });
    expect(body[3]?.status).toMatchObject({
      account: { id: t.me.actorId },
      content: '',
      url: 'https://bsky.app/profile/did:plc:me/post/3kpost',
    });
    expect(body[0]).toMatchObject({
      account: { acct: 'alice.bsky.social', url: 'https://bsky.app/profile/alice.bsky.social', display_name: 'Alice' },
      iori: {
        bluesky: {
          reason: 'reply',
          url: 'https://bsky.app/profile/did:plc:alice/post/3kreply',
          uri: 'at://did:plc:alice/app.bsky.feed.post/3kreply',
          text: 'hello',
        },
      },
    });
    expect(body[3]?.iori?.bluesky?.url).toBe('https://bsky.app/profile/did:plc:me/post/3kpost');
    expect(body[3]?.iori?.bluesky?.uri).toBe('at://did:plc:me/app.bsky.feed.post/3kpost');
    expect(body[1]?.iori?.bluesky).not.toHaveProperty('uri');
  });

  it('対象の投稿が削除済みなら、Bluesky の通知は最小の Status を合成して返す', async () => {
    const t = await seedBluesky();
    t.sqlite.prepare('UPDATE posts SET deletedAt = 1 WHERE postId = ?').run(t.myPost.postId);

    const response = await t.get('/api/v1/notifications?limit=4');

    const body = ((await response.json()) as unknown[]).map((item) => NotificationSchema.parse(item));
    expect(body.find((item) => item.id === t.bluesky.repost)).toMatchObject({
      type: 'reblog',
      status: { id: LIKED_STATUS_ID, content: '', account: { id: t.me.actorId } },
    });
  });

  it('返信先が自分の iori 投稿として解決できる blueskyMention でも、合成 Status を返す', async () => {
    const t = await seedBluesky();
    const resolvedMention = t.seed.addBlueskyNotification(t.me.userId, 'blueskyMention', 7_400, {
      blueskyUri: 'at://did:plc:alice/app.bsky.feed.post/3kresolved',
      reason: 'reply',
      subjectUri: 'at://did:plc:me/app.bsky.feed.post/3kpost',
      targetPostId: t.myPost.postId,
      text: 'resolved hello',
    });

    const response = await t.get(`/api/v1/notifications/${resolvedMention}`);

    const body = NotificationSchema.parse(await response.json());
    expect(body.status).toMatchObject({
      id: 'bluesky:at://did:plc:alice/app.bsky.feed.post/3kresolved',
      account: { id: ALICE_ACCOUNT_ID },
      content: '<p>resolved hello</p>',
    });
  });

  it('リポスト経由の通知は、元の投稿の作者を DID から表した合成 Status で返し、受信者を作者にしない', async () => {
    const t = await seedBluesky();
    const original = 'at://did:plc:other/app.bsky.feed.post/3korig';
    const likeViaRepost = t.seed.addBlueskyNotification(t.me.userId, 'blueskyLikeViaRepost', 7_400, {
      subjectUri: original,
    });
    const repostViaRepost = t.seed.addBlueskyNotification(t.me.userId, 'blueskyRepostViaRepost', 7_500, {
      subjectUri: original,
    });

    const response = await t.get('/api/v1/notifications?limit=2');

    const body = ((await response.json()) as unknown[]).map((item) => NotificationSchema.parse(item));
    expect(body.map((item) => [item.id, item.type, item.account.id])).toEqual([
      [repostViaRepost, 'reblog', ALICE_ACCOUNT_ID],
      [likeViaRepost, 'favourite', ALICE_ACCOUNT_ID],
    ]);
    for (const item of body) {
      expect(item.status).toMatchObject({
        id: `bluesky:${original}`,
        account: { id: 'bluesky:did:plc:other', acct: 'did:plc:other' },
        content: '',
        url: 'https://bsky.app/profile/did:plc:other/post/3korig',
      });
      expect(item.status?.account.id).not.toBe(t.me.actorId);
    }
    expect(body[1]?.iori?.bluesky).toEqual({
      reason: 'like-via-repost',
      url: 'https://bsky.app/profile/did:plc:other/post/3korig',
      uri: original,
    });
    expect(await t.typesOf(await t.get('/api/v1/notifications?types[]=favourite'))).toEqual([
      'favourite',
      'favourite',
    ]);
  });

  it('subscribed-post は status として本文つきで返し、types[]=status で絞り込めて types[]=mention には出さない', async () => {
    const t = await seedBluesky();
    const subscribed = t.seed.addBlueskyNotification(t.me.userId, 'blueskySubscribedPost', 7_400, {
      blueskyUri: 'at://did:plc:alice/app.bsky.feed.post/3knew',
      subjectUri: null,
      text: 'new post',
    });

    const [single, statuses, mentions, defaults] = await Promise.all([
      t.get(`/api/v1/notifications/${subscribed}`),
      t.get('/api/v1/notifications?types[]=status'),
      t.get('/api/v1/notifications?types[]=mention'),
      t.get('/api/v1/notifications?limit=1'),
    ]);

    expect(NotificationSchema.parse(await single.json())).toMatchObject({
      id: subscribed,
      type: 'status',
      account: { id: ALICE_ACCOUNT_ID },
      status: { id: 'bluesky:at://did:plc:alice/app.bsky.feed.post/3knew', content: '<p>new post</p>' },
      iori: { bluesky: { reason: 'subscribed-post', text: 'new post' } },
    });
    expect(((await statuses.json()) as Array<{ id: string }>).map((item) => item.id)).toEqual([subscribed]);
    expect(((await mentions.json()) as Array<{ id: string }>).map((item) => item.id)).toEqual([t.bluesky.mention]);
    expect(((await defaults.json()) as Array<{ id: string }>).map((item) => item.id)).toEqual([subscribed]);
  });

  it('グループ API の status 一覧に、合成した Status を重複なく載せる', async () => {
    const t = await seedBluesky();

    const response = await t.get('/api/v2/notifications?types[]=favourite&types[]=mention&types[]=reblog');

    const body = GroupedNotificationsResultsSchema.parse(await response.json());
    expect(body.notification_groups.map((group) => [group.type, group.status_id])).toEqual([
      ['mention', MENTION_STATUS_ID],
      ['reblog', t.myPost.postId],
      ['favourite', LIKED_STATUS_ID],
    ]);
    expect(body.statuses.map((status) => status.id)).toEqual([MENTION_STATUS_ID, t.myPost.postId, LIKED_STATUS_ID]);
    expect(body.statuses.map((status) => status.account.id)).toEqual([ALICE_ACCOUNT_ID, t.me.actorId, t.me.actorId]);
  });

  it('unread_count に数え、dismiss と clear で消せるが受信の記録は残る', async () => {
    const t = await seedBluesky();
    const unread = async () => (await (await t.get('/api/v1/notifications/unread_count')).json()) as { count: number };

    expect(await unread()).toEqual({ count: 5 });
    const dismissed = await t.post(`/api/v1/notifications/${t.bluesky.like}/dismiss`);
    expect(dismissed.status).toBe(200);
    expect(await unread()).toEqual({ count: 4 });
    await t.post('/api/v1/notifications/clear');
    expect(await unread()).toEqual({ count: 0 });
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM notification_bluesky').get()).toMatchObject({ n: 0 });
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM bluesky_notification_receipts').get()).toMatchObject({ n: 4 });
  });
});
