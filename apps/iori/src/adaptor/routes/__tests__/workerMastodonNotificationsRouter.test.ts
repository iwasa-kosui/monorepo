import { describe, expect, it } from 'vitest';

import {
  GroupedNotificationsResultsSchema,
  NotificationPolicySchema,
  NotificationSchema,
} from '../../mastodon/entities.ts';
import { linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';

const jsonHeaders = (bearer: Record<string, string>) => ({ ...bearer, 'Content-Type': 'application/json' });

const seedNotifications = async () => {
  const t = setupReadApi();
  const me = await t.signIn('read write');
  const other = t.seed.addLocalActor('other');
  const alice = t.seed.addRemoteActor('alice');
  const bob = t.seed.addRemoteActor('bob');
  const myPost = t.seed.addLocalPost(me, 1_000);
  const aliceReply = t.seed.addRemotePost(alice, 1_500, { timeline: false });
  const ids = {
    like: t.seed.addLikeNotification(me.userId, alice.actorId, myPost.postId, 2_000),
    reply: t.seed.addReplyNotification(me.userId, bob.actorId, aliceReply.postId, myPost.postId, 3_000),
    follow: t.seed.addFollowNotification(me.userId, alice.actorId, 4_000),
    emoji: t.seed.addEmojiReactNotification(me.userId, bob.actorId, myPost.postId, 5_000, ':wave:', 'https://e/w.png'),
    others: t.seed.addLikeNotification(other.userId, alice.actorId, myPost.postId, 6_000),
  };
  const get = (path: string, headers: Record<string, string> = me.bearer) => t.request(path, { headers });
  const typesOf = async (response: Response) =>
    ((await response.json()) as Array<{ type: string }>).map((item) => item.type);
  return { ...t, me, other, alice, bob, myPost, aliceReply, ids, get, typesOf };
};

describe('GET /api/v1/notifications', () => {
  it('新しい順の Notification の配列を返し、emojiReact と他人の通知を含めない', async () => {
    const t = await seedNotifications();

    const response = await t.get('/api/v1/notifications');

    expect(response.status).toBe(200);
    const body = ((await response.json()) as unknown[]).map((item) => NotificationSchema.parse(item));
    expect(body.map((item) => [item.id, item.type, item.status?.id, item.account.id])).toEqual([
      [t.ids.follow, 'follow', undefined, t.alice.actorId],
      [t.ids.reply, 'mention', t.aliceReply.postId, t.bob.actorId],
      [t.ids.like, 'favourite', t.myPost.postId, t.alice.actorId],
    ]);
    expect(body[2]?.created_at).toBe('1970-01-01T00:00:02.000Z');
  });

  it('types[] に iori:emoji_reaction を明示したときだけ絵文字リアクションを返す', async () => {
    const t = await seedNotifications();

    const response = await t.get('/api/v1/notifications?types[]=iori:emoji_reaction');

    const body = ((await response.json()) as unknown[]).map((item) => NotificationSchema.parse(item));
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: t.ids.emoji,
      type: 'iori:emoji_reaction',
      iori: { emoji: ':wave:', url: 'https://e/w.png' },
      status: { id: t.myPost.postId },
      account: { id: t.bob.actorId },
    });
  });

  it('types[] と exclude_types[] で絞り込み、未知の type は無視する', async () => {
    const t = await seedNotifications();

    const [only, excluded, all, mixed, unknownOnly, withEmoji] = await Promise.all([
      t.get('/api/v1/notifications?types[]=favourite'),
      t.get('/api/v1/notifications?exclude_types[]=follow&exclude_types[]=mention'),
      t.get('/api/v1/notifications?types[]=favourite&types[]=mention&types[]=follow&types[]=iori:emoji_reaction'),
      t.get('/api/v1/notifications?types[]=favourite&types[]=bogus'),
      t.get('/api/v1/notifications?types[]=bogus'),
      t.get('/api/v1/notifications?types[]=iori:emoji_reaction&exclude_types[]=iori:emoji_reaction'),
    ]);

    expect(await t.typesOf(only)).toEqual(['favourite']);
    expect(await t.typesOf(excluded)).toEqual(['favourite']);
    expect(await t.typesOf(all)).toEqual(['iori:emoji_reaction', 'follow', 'mention', 'favourite']);
    expect(await t.typesOf(mixed)).toEqual(['favourite']);
    expect(await t.typesOf(unknownOnly)).toEqual(['follow', 'mention', 'favourite']);
    expect(await t.typesOf(withEmoji)).toEqual([]);
  });

  it('limit と max_id と min_id と Link ヘッダーでページを送る', async () => {
    const t = await seedNotifications();

    const first = await t.get('/api/v1/notifications?limit=2');
    const next = linkOf(first, 'next');
    const second = await t.get(`${next?.pathname}${next?.search}`);
    const prev = linkOf(first, 'prev');
    const newer = await t.get(`${prev?.pathname}${prev?.search}`);

    const idsOf = async (response: Response) =>
      ((await response.json()) as Array<{ id: string }>).map((item) => item.id);
    expect(await idsOf(first)).toEqual([t.ids.follow, t.ids.reply]);
    expect(next?.searchParams.get('max_id')).toBe(t.ids.reply);
    expect(next?.searchParams.get('limit')).toBe('2');
    expect(prev?.searchParams.get('min_id')).toBe(t.ids.follow);
    expect(await idsOf(second)).toEqual([t.ids.like]);
    expect(await idsOf(newer)).toEqual([]);
    expect(newer.headers.get('Link')).toBeNull();
  });

  it('対象の投稿が削除済みの通知は返さないが、ページの位置は進める', async () => {
    const t = await seedNotifications();
    t.sqlite.prepare('UPDATE posts SET deletedAt = 1 WHERE postId = ?').run(t.aliceReply.postId);

    const response = await t.get('/api/v1/notifications?limit=2');

    expect(await t.typesOf(response.clone())).toEqual(['follow']);
    expect(linkOf(response, 'next')?.searchParams.get('max_id')).toBe(t.ids.reply);
  });

  it('未認証は 401、read:notifications がないトークンは 403 にする', async () => {
    const t = await seedNotifications();

    const [anonymous, wrongScope, cookie] = await Promise.all([
      t.request('/api/v1/notifications'),
      t.get('/api/v1/notifications', await t.bearerFor('read:statuses')),
      t.get('/api/v1/notifications', { Cookie: `sessionId=${t.me.sessionId}` }),
    ]);

    expect([anonymous.status, wrongScope.status, cookie.status]).toEqual([401, 403, 200]);
    expect(await anonymous.json()).toEqual({ error: 'The access token is invalid' });
  });
});

describe('GET /api/v1/notifications/:id', () => {
  it('自分の通知を Notification で返し、emojiReact も ID を指定すれば返す', async () => {
    const t = await seedNotifications();

    const [like, emoji] = await Promise.all([
      t.get(`/api/v1/notifications/${t.ids.like}`),
      t.get(`/api/v1/notifications/${t.ids.emoji}`),
    ]);

    expect(NotificationSchema.parse(await like.json())).toMatchObject({
      id: t.ids.like,
      type: 'favourite',
      status: { id: t.myPost.postId },
    });
    expect(NotificationSchema.parse(await emoji.json())).toMatchObject({ type: 'iori:emoji_reaction' });
  });

  it('他人の通知、存在しない ID、不正な ID は 404 にする', async () => {
    const t = await seedNotifications();

    const responses = await Promise.all([
      t.get(`/api/v1/notifications/${t.ids.others}`),
      t.get(`/api/v1/notifications/${t.seed.uuid()}`),
      t.get('/api/v1/notifications/not-an-id'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(await responses[0]!.json()).toEqual({ error: 'Record not found' });
  });

  it('read:notifications がないトークンは 403 にする', async () => {
    const t = await seedNotifications();

    const response = await t.get(`/api/v1/notifications/${t.ids.like}`, await t.bearerFor('read:statuses'));

    expect(response.status).toBe(403);
  });
});

describe('GET /api/v2/notifications', () => {
  it('通知を 1 件ずつ 1 グループにして、重複のない accounts と statuses を返す', async () => {
    const t = await seedNotifications();

    const response = await t.get('/api/v2/notifications');

    expect(response.status).toBe(200);
    const body = GroupedNotificationsResultsSchema.parse(await response.json());
    expect(body.notification_groups).toEqual([
      {
        group_key: `ungrouped-${t.ids.follow}`,
        notifications_count: 1,
        type: 'follow',
        most_recent_notification_id: t.ids.follow,
        page_min_id: t.ids.follow,
        page_max_id: t.ids.follow,
        latest_page_notification_at: '1970-01-01T00:00:04.000Z',
        sample_account_ids: [t.alice.actorId],
      },
      {
        group_key: `ungrouped-${t.ids.reply}`,
        notifications_count: 1,
        type: 'mention',
        most_recent_notification_id: t.ids.reply,
        page_min_id: t.ids.reply,
        page_max_id: t.ids.reply,
        latest_page_notification_at: '1970-01-01T00:00:03.000Z',
        sample_account_ids: [t.bob.actorId],
        status_id: t.aliceReply.postId,
      },
      {
        group_key: `ungrouped-${t.ids.like}`,
        notifications_count: 1,
        type: 'favourite',
        most_recent_notification_id: t.ids.like,
        page_min_id: t.ids.like,
        page_max_id: t.ids.like,
        latest_page_notification_at: '1970-01-01T00:00:02.000Z',
        sample_account_ids: [t.alice.actorId],
        status_id: t.myPost.postId,
      },
    ]);
    expect(body.accounts.map((account) => account.id).sort()).toEqual([t.alice.actorId, t.bob.actorId].sort());
    expect(body.statuses.map((status) => status.id).sort()).toEqual([t.aliceReply.postId, t.myPost.postId].sort());
  });

  it('同じ投稿への通知が複数あっても statuses に重ねない', async () => {
    const t = await seedNotifications();
    t.seed.addLikeNotification(t.me.userId, t.bob.actorId, t.myPost.postId, 2_500);

    const response = await t.get('/api/v2/notifications');

    const body = GroupedNotificationsResultsSchema.parse(await response.json());
    expect(body.notification_groups).toHaveLength(4);
    expect(body.statuses.filter((status) => status.id === t.myPost.postId)).toHaveLength(1);
  });

  it('絵文字リアクションは iori の拡張フィールドをグループに載せ、フィルターと Link は v1 と同じ', async () => {
    const t = await seedNotifications();

    const [emoji, v1, v2] = await Promise.all([
      t.get('/api/v2/notifications?types[]=iori:emoji_reaction'),
      t.get('/api/v1/notifications?limit=2&expand_accounts=full&grouped_types[]=favourite&include_filtered=true'),
      t.get('/api/v2/notifications?limit=2&expand_accounts=full&grouped_types[]=favourite&include_filtered=true'),
    ]);

    const body = GroupedNotificationsResultsSchema.parse(await emoji.json());
    expect(body.notification_groups).toMatchObject([
      { type: 'iori:emoji_reaction', iori: { emoji: ':wave:', url: 'https://e/w.png' }, status_id: t.myPost.postId },
    ]);
    expect(v2.headers.get('Link')?.replace(/\/v2\//g, '/v1/')).toBe(
      v1.headers.get('Link')?.replace(/\/v2\//g, '/v1/'),
    );
    expect(GroupedNotificationsResultsSchema.parse(await v2.json()).notification_groups).toHaveLength(2);
  });

  it('read:notifications がないトークンは 403 にする', async () => {
    const t = await seedNotifications();

    const response = await t.get('/api/v2/notifications', await t.bearerFor('read:statuses'));

    expect(response.status).toBe(403);
  });
});

describe('GET /api/v2/notifications/policy', () => {
  it('固定の通知ポリシーを返す', async () => {
    const t = await seedNotifications();

    const response = await t.get('/api/v2/notifications/policy');

    expect(NotificationPolicySchema.parse(await response.json())).toEqual({
      for_not_following: 'accept',
      for_not_followers: 'accept',
      for_new_accounts: 'accept',
      for_private_mentions: 'filter',
      for_limited_accounts: 'filter',
      summary: { pending_requests_count: 0, pending_notifications_count: 0 },
    });
  });

  it('read:notifications がないトークンは 403 にする', async () => {
    const t = await seedNotifications();

    const response = await t.get('/api/v2/notifications/policy', await t.bearerFor('read:statuses'));

    expect(response.status).toBe(403);
  });
});

describe('unread_count と markers', () => {
  const unread = async (t: Awaited<ReturnType<typeof seedNotifications>>, query = '') => {
    const [v1, v2] = await Promise.all([
      t.get(`/api/v1/notifications/unread_count${query}`),
      t.get(`/api/v2/notifications/unread_count${query}`),
    ]);
    return [await v1.json(), await v2.json()];
  };

  it('マーカーがなければ emojiReact を除く全件を数える', async () => {
    const t = await seedNotifications();

    expect(await unread(t)).toEqual([{ count: 3 }, { count: 3 }]);
  });

  it('notifications のマーカーを保存すると、それより新しい通知だけを数える', async () => {
    const t = await seedNotifications();

    const saved = await t.request('/api/v1/markers', {
      method: 'POST',
      headers: jsonHeaders(t.me.bearer),
      body: JSON.stringify({ notifications: { last_read_id: t.ids.reply } }),
    });

    expect(saved.status).toBe(200);
    expect(await unread(t)).toEqual([{ count: 1 }, { count: 1 }]);
  });

  it('home のマーカーは通知の件数に影響しない', async () => {
    const t = await seedNotifications();

    await t.request('/api/v1/markers', {
      method: 'POST',
      headers: jsonHeaders(t.me.bearer),
      body: JSON.stringify({ home: { last_read_id: t.ids.follow } }),
    });

    expect(await unread(t)).toEqual([{ count: 3 }, { count: 3 }]);
  });

  it.each(['v1', 'v2'])('%s の unread_count は exclude_types[] で除いた type を数えない', async (version) => {
    const t = await seedNotifications();

    const response = await t.get(`/api/${version}/notifications/unread_count?exclude_types[]=follow`);

    expect(await response.json()).toEqual({ count: 2 });
  });

  it('limit で件数を頭打ちにする', async () => {
    const t = await seedNotifications();

    expect(await unread(t, '?limit=2')).toEqual([{ count: 2 }, { count: 2 }]);
  });

  it('GET の markers は保存済みの timeline だけを返す', async () => {
    const t = await seedNotifications();
    const empty = await t.get('/api/v1/markers?timeline[]=home&timeline[]=notifications');
    await t.request('/api/v1/markers', {
      method: 'POST',
      headers: jsonHeaders(t.me.bearer),
      body: JSON.stringify({ home: { last_read_id: 'h1' }, notifications: { last_read_id: 'n1' } }),
    });

    const [both, homeOnly, none] = await Promise.all([
      t.get('/api/v1/markers?timeline[]=home&timeline[]=notifications'),
      t.get('/api/v1/markers?timeline[]=home'),
      t.get('/api/v1/markers'),
    ]);

    expect(await empty.json()).toEqual({});
    const body = await both.json() as Record<string, { last_read_id: string; version: number; updated_at: string }>;
    expect(body['home']).toMatchObject({ last_read_id: 'h1', version: 1 });
    expect(body['notifications']).toMatchObject({ last_read_id: 'n1', version: 1 });
    expect(new Date(body['home']!.updated_at).toISOString()).toBe(body['home']!.updated_at);
    expect(Object.keys(await homeOnly.json() as object)).toEqual(['home']);
    expect(await none.json()).toEqual({});
  });

  it('POST は保存のたびに version を 1 増やし、指定のない側は返さず、別のユーザーに影響しない', async () => {
    const t = await seedNotifications();
    const post = (body: string, contentType = 'application/json') =>
      t.request('/api/v1/markers', {
        method: 'POST',
        headers: { ...t.me.bearer, 'Content-Type': contentType },
        body,
      });

    const first = await post(JSON.stringify({ home: { last_read_id: 'a' } }));
    const second = await post('home[last_read_id]=b', 'application/x-www-form-urlencoded');
    const third = await post(JSON.stringify({ home: { last_read_id: '' }, notifications: {} }));

    expect(await first.json()).toMatchObject({ home: { last_read_id: 'a', version: 1 } });
    const secondBody = await second.json() as Record<string, unknown>;
    expect(Object.keys(secondBody)).toEqual(['home']);
    expect(secondBody['home']).toMatchObject({ last_read_id: 'b', version: 2 });
    expect(await third.json()).toEqual({});
    const mine = await t.get('/api/v1/markers?timeline[]=home');
    expect(await mine.json()).toMatchObject({ home: { last_read_id: 'b', version: 2 } });
    const other = await t.bearerFor('read write');
    expect(await (await t.get('/api/v1/markers?timeline[]=home', other)).json()).toEqual({});
  });

  it('スコープが足りないトークンは 403、未認証は 401 にする', async () => {
    const t = await seedNotifications();
    const readOnly = await t.bearerFor('read:statuses');
    const writeOnly = await t.bearerFor('write:statuses');

    const responses = await Promise.all([
      t.get('/api/v1/markers', writeOnly),
      t.request('/api/v1/markers', { method: 'POST', headers: jsonHeaders(readOnly), body: '{}' }),
      t.get('/api/v1/notifications/unread_count', readOnly),
      t.get('/api/v2/notifications/unread_count', readOnly),
      t.request('/api/v1/markers'),
      t.request('/api/v2/notifications/unread_count'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 401, 401]);
  });
});
