import { describe, expect, it } from 'vitest';

import { GroupedNotificationsResultsSchema, NotificationSchema } from '../../mastodon/entities.ts';
import { toGroupedNotificationId } from '../../mastodon/toNotification.ts';
import { linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';

const jsonHeaders = (bearer: Record<string, string>) => ({ ...bearer, 'Content-Type': 'application/json' });

const seedNotifications = async () => {
  const t = setupReadApi();
  const me = await t.signIn('read write');
  const other = t.seed.addLocalActor('other');
  const alice = t.seed.addRemoteActor('alice');
  const bob = t.seed.addRemoteActor('bob');
  const myPost = t.seed.addLocalPost(me, 1_000);
  const aliceReply = t.seed.addRemotePost(alice, 1_500, { timeline: false, visibility: 'public' });
  const ids = {
    like: t.seed.addLikeNotification(me.userId, alice.actorId, myPost.postId, 2_000),
    reply: t.seed.addReplyNotification(me.userId, bob.actorId, aliceReply.postId, myPost.postId, 3_000),
    follow: t.seed.addFollowNotification(me.userId, alice.actorId, 4_000),
    emoji: t.seed.addEmojiReactNotification(me.userId, bob.actorId, myPost.postId, 5_000, ':wave:', 'https://e/w.png'),
    others: t.seed.addLikeNotification(other.userId, alice.actorId, myPost.postId, 6_000),
  };
  const get = (path: string, headers: Record<string, string> = me.bearer) => t.request(path, { headers });
  const addFollowNotificationWithId = (notificationId: string, createdAt: number, recipientUserId = me.userId) => {
    t.sqlite.prepare(
      'INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)',
    )
      .run(notificationId, recipientUserId, 'follow', 0, createdAt);
    t.sqlite.prepare('INSERT INTO notification_follows(notificationId,followerActorId) VALUES (?,?)')
      .run(notificationId, alice.actorId);
  };
  const typesOf = async (response: Response) =>
    ((await response.json()) as Array<{ type: string }>).map((item) => item.type);
  return { ...t, me, other, alice, bob, myPost, aliceReply, ids, get, typesOf, addFollowNotificationWithId };
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

describe('ブロックした相手の通知', () => {
  it('v1 の一覧と未読数と単体の取得から除くが、ミュートした相手の通知は除かない', async () => {
    const t = await seedNotifications();
    t.seed.addBlock(t.me.userId, t.alice.actorId);

    const [list, single, unread] = await Promise.all([
      t.get('/api/v1/notifications'),
      t.get(`/api/v1/notifications/${t.ids.like}`),
      t.get('/api/v1/notifications/unread_count'),
    ]);

    expect(((await list.json()) as Array<{ id: string }>).map((item) => item.id)).toEqual([t.ids.reply]);
    expect(single.status).toBe(404);
    expect(await unread.json()).toEqual({ count: 1 });
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
});

describe('GET /api/v2/notifications', () => {
  it('通知を 1 件ずつ 1 グループにして、重複のない accounts と statuses を返す', async () => {
    const t = await seedNotifications();

    const response = await t.get('/api/v2/notifications');

    expect(response.status).toBe(200);
    const body = GroupedNotificationsResultsSchema.parse(await response.json());
    expect(body.notification_groups.map((group) => [group.group_key, group.type, group.status_id])).toEqual([
      [`ungrouped-${t.ids.follow}`, 'follow', undefined],
      [`ungrouped-${t.ids.reply}`, 'mention', t.aliceReply.postId],
      [`ungrouped-${t.ids.like}`, 'favourite', t.myPost.postId],
    ]);
    expect(body.notification_groups[0]).toMatchObject({
      notifications_count: 1,
      most_recent_notification_id: toGroupedNotificationId(t.ids.follow, 4_000),
      page_min_id: t.ids.follow,
      page_max_id: t.ids.follow,
      sample_account_ids: [t.alice.actorId],
    });
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

  it('先頭 10 bit が一致する UUID が同じミリ秒にあっても、値を重ねずに狭義の降順で返す', async () => {
    const t = await seedNotifications();
    const sameBitsHigh = '1a300000-0000-4000-8000-000000000001';
    const sameBitsLow = '1a000000-0000-4000-8000-000000000002';
    t.addFollowNotificationWithId(sameBitsLow, 4_000);
    t.addFollowNotificationWithId(sameBitsHigh, 4_000);

    const response = await t.get('/api/v2/notifications');

    const body = GroupedNotificationsResultsSchema.parse(await response.json());
    const values = body.notification_groups.map((group) => group.most_recent_notification_id);
    expect(toGroupedNotificationId(sameBitsHigh, 4_000)).toBe(toGroupedNotificationId(sameBitsLow, 4_000));
    expect(body.notification_groups.slice(0, 3).map((group) => group.page_max_id)).toEqual([
      sameBitsHigh,
      sameBitsLow,
      t.ids.follow,
    ]);
    expect(values[0]).toBe(toGroupedNotificationId(sameBitsHigh, 4_000));
    expect(values[1]).toBe(values[0]! - 1);
    expect(new Set(values).size).toBe(values.length);
    values.slice(1).forEach((value, index) => expect(value).toBeLessThan(values[index]!));
  });

  it('2 ページ取得しても most_recent_notification_id がページをまたいで狭義に減っていく', async () => {
    const t = await seedNotifications();
    t.addFollowNotificationWithId('f0000000-0000-4000-8000-000000000001', 4_000);
    t.addFollowNotificationWithId('80000000-0000-4000-8000-000000000002', 3_000);

    const first = await t.get('/api/v2/notifications?limit=2');
    const next = linkOf(first, 'next');
    const second = await t.get(`${next?.pathname}${next?.search}`);

    const valuesOf = async (response: Response) =>
      GroupedNotificationsResultsSchema.parse(await response.json()).notification_groups.map((group) =>
        group.most_recent_notification_id
      );
    const firstValues = await valuesOf(first);
    const secondValues = await valuesOf(second);
    expect(firstValues).toHaveLength(2);
    expect(secondValues).toHaveLength(2);
    for (const values of [firstValues, secondValues]) {
      expect(values[0]!).toBeGreaterThan(values[1]!);
    }
    expect(Math.min(...firstValues)).toBeGreaterThan(Math.max(...secondValues));
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

  describe('notifications の last_read_id に most_recent_notification_id の整数が届いたとき', () => {
    const postMarker = (t: Awaited<ReturnType<typeof seedNotifications>>, lastReadId: unknown) =>
      t.request('/api/v1/markers', {
        method: 'POST',
        headers: jsonHeaders(t.me.bearer),
        body: JSON.stringify({ notifications: { last_read_id: lastReadId } }),
      });
    const savedLastReadId = async (t: Awaited<ReturnType<typeof seedNotifications>>) => {
      const body = await (await t.get('/api/v1/markers?timeline[]=notifications')).json() as Record<
        string,
        { last_read_id: string; version: number }
      >;
      return body['notifications'];
    };

    it.each([
      ['文字列', (n: number) => String(n)],
      ['数値', (n: number) => n],
    ])('自分の通知の整数を%sで送ると、その通知の UUID を保存して未読数が下がる', async (_label, encode) => {
      const t = await seedNotifications();

      const saved = await postMarker(t, encode(toGroupedNotificationId(t.ids.reply, 3_000)));

      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ notifications: { last_read_id: t.ids.reply, version: 1 } });
      expect(await savedLastReadId(t)).toMatchObject({ last_read_id: t.ids.reply });
      expect(await unread(t)).toEqual([{ count: 1 }, { count: 1 }]);
    });

    it('同じミリ秒・同じ先頭 10 bit の通知を持つ他の利用者がいても、自分の通知の UUID を保存する', async () => {
      const t = await seedNotifications();
      t.addFollowNotificationWithId('00000000-0000-4000-8000-0000000000ff', 3_000, t.other.userId);

      const saved = await postMarker(t, toGroupedNotificationId(t.ids.reply, 3_000));

      expect(await saved.json()).toMatchObject({ notifications: { last_read_id: t.ids.reply } });
    });

    it('同じ値が自分の通知の中で複数一致するときは、ID が最大の通知を保存する', async () => {
      const t = await seedNotifications();
      const larger = '00100000-0000-4000-8000-000000000001';
      t.addFollowNotificationWithId(larger, 3_000);

      const saved = await postMarker(t, toGroupedNotificationId(t.ids.reply, 3_000));

      expect(toGroupedNotificationId(larger, 3_000)).toBe(toGroupedNotificationId(t.ids.reply, 3_000));
      expect(await saved.json()).toMatchObject({ notifications: { last_read_id: larger } });
    });

    it('他の利用者の通知の整数にしか一致しないときは、既存の値を変えない', async () => {
      const t = await seedNotifications();
      t.seed.setMarker(t.me.userId, 'notifications', t.ids.like);

      const saved = await postMarker(t, toGroupedNotificationId(t.ids.others, 6_000));

      expect(await saved.json()).toEqual({});
      expect(await savedLastReadId(t)).toMatchObject({ last_read_id: t.ids.like, version: 1 });
    });

    it.each([
      ['一致する通知がない整数', toGroupedNotificationId('00000000-0000-4000-8000-000000000000', 9_999)],
      ['小数', 1.5],
      ['安全な整数でない数字列', '99999999999999999999'],
    ])('%sのときは、既存の値を変えない', async (_label, lastReadId) => {
      const t = await seedNotifications();
      t.seed.setMarker(t.me.userId, 'notifications', t.ids.like);

      const saved = await postMarker(t, lastReadId);

      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({});
      expect(await savedLastReadId(t)).toMatchObject({ last_read_id: t.ids.like, version: 1 });
    });
  });

  it.each(['v1', 'v2'])('%s の unread_count は exclude_types[] で除いた type を数えない', async (version) => {
    const t = await seedNotifications();

    const response = await t.get(`/api/${version}/notifications/unread_count?exclude_types[]=follow`);

    expect(await response.json()).toEqual({ count: 2 });
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
