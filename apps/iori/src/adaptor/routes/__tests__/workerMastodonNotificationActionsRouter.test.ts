import { describe, expect, it } from 'vitest';

import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const notFound = { error: 'Record not found' };

const seedNotifications = async () => {
  const t = setupReadApi();
  const me = await t.signIn('read write');
  const other = t.seed.addLocalActor('other');
  const alice = t.seed.addRemoteActor('alice');
  const myPost = t.seed.addLocalPost(me, 1_000);
  const aliceReply = t.seed.addRemotePost(alice, 1_500, { timeline: false });
  const ids = {
    like: t.seed.addLikeNotification(me.userId, alice.actorId, myPost.postId, 2_000),
    reply: t.seed.addReplyNotification(me.userId, alice.actorId, aliceReply.postId, myPost.postId, 3_000),
    follow: t.seed.addFollowNotification(me.userId, alice.actorId, 4_000),
    emoji: t.seed.addEmojiReactNotification(me.userId, alice.actorId, myPost.postId, 5_000),
    others: t.seed.addLikeNotification(other.userId, alice.actorId, myPost.postId, 6_000),
  };
  const post = (path: string, headers: Record<string, string> = me.bearer) =>
    t.request(path, { method: 'POST', headers });
  const count = (table: string, where = '1=1') =>
    Number((t.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number | bigint }).n);
  const remaining = () =>
    (t.sqlite.prepare('SELECT notificationId FROM notifications').all() as Array<{ notificationId: string }>)
      .map((row) => row.notificationId).sort();
  const events = (eventName: string) =>
    t.sqlite.prepare('SELECT eventPayload FROM domain_events WHERE eventName = ?').all(eventName) as Array<
      { eventPayload: string }
    >;
  return { ...t, me, other, ids, post, count, remaining, events };
};

describe('POST /api/v1/notifications/clear', () => {
  it('自分の通知を種類を問わず子表ごと消し、他人の通知を残して {} を返す', async () => {
    const t = await seedNotifications();

    const response = await t.post('/api/v1/notifications/clear');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(t.remaining()).toEqual([t.ids.others]);
    expect([
      t.count('notification_likes'),
      t.count('notification_replies'),
      t.count('notification_follows'),
      t.count('notification_emoji_reacts'),
    ]).toEqual([1, 0, 0, 0]);
    expect(t.events('notification.notificationsCleared').map((row) => JSON.parse(row.eventPayload))).toEqual([
      { userId: t.me.userId },
    ]);
  });

  it('通知がないときも {} を返し、イベントを記録しない', async () => {
    const t = await seedNotifications();
    await t.post('/api/v1/notifications/clear');

    const response = await t.post('/api/v1/notifications/clear');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(t.events('notification.notificationsCleared')).toHaveLength(1);
  });

  it('100 件を超える通知も消せる', async () => {
    const t = await seedNotifications();
    for (let index = 0; index < 150; index++) {
      t.seed.addFollowNotification(t.me.userId, t.other.actorId, 10_000 + index);
    }

    const response = await t.post('/api/v1/notifications/clear');

    expect(response.status).toBe(200);
    expect(t.remaining()).toEqual([t.ids.others]);
  });

  it('トークンがないと 401、write:notifications を満たさないスコープは 403 にして消さない', async () => {
    const t = await seedNotifications();
    const readOnly = await t.bearerFor('read');

    const responses = await Promise.all([
      t.request('/api/v1/notifications/clear', { method: 'POST' }),
      t.post('/api/v1/notifications/clear', readOnly),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 403]);
    expect(t.remaining()).toHaveLength(5);
  });

  it('write:notifications だけのトークンで消せる', async () => {
    const t = setupReadApi();
    const me = await t.signIn('write:notifications');
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollowNotification(me.userId, alice.actorId, 1_000);

    const response = await t.request('/api/v1/notifications/clear', { method: 'POST', headers: me.bearer });

    expect(response.status).toBe(200);
  });

  it('Cookie の利用者は同一オリジンのときだけ消せ、Origin が違うか欠けると 403 にする', async () => {
    const t = await seedNotifications();
    const cookie = { Cookie: `sessionId=${t.me.sessionId}` };

    const cross = await t.post('/api/v1/notifications/clear', { ...cookie, Origin: 'https://evil.example' });
    const missing = await t.post('/api/v1/notifications/clear', cookie);
    const same = await t.post('/api/v1/notifications/clear', { ...cookie, Origin: ORIGIN });

    expect([cross.status, missing.status, same.status]).toEqual([403, 403, 200]);
    expect(t.remaining()).toEqual([t.ids.others]);
  });
});

describe('POST /api/v1/notifications/:id/dismiss', () => {
  it('指定した通知だけを子表ごと消し、{} を返す', async () => {
    const t = await seedNotifications();

    const response = await t.post(`/api/v1/notifications/${t.ids.reply}/dismiss`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(t.remaining()).toEqual([t.ids.like, t.ids.follow, t.ids.emoji, t.ids.others].sort());
    expect(t.count('notification_replies')).toBe(0);
    expect(t.events('notification.notificationDismissed').map((row) => JSON.parse(row.eventPayload))).toEqual([
      { notificationId: t.ids.reply, userId: t.me.userId },
    ]);
  });

  it('消した通知をもう一度消そうとすると 404 にする', async () => {
    const t = await seedNotifications();
    await t.post(`/api/v1/notifications/${t.ids.like}/dismiss`);

    const response = await t.post(`/api/v1/notifications/${t.ids.like}/dismiss`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(notFound);
    expect(t.events('notification.notificationDismissed')).toHaveLength(1);
  });

  it('他人の通知、存在しない通知、不正な ID は 404 にして他人の通知を消さない', async () => {
    const t = await seedNotifications();

    const responses = await Promise.all([
      t.post(`/api/v1/notifications/${t.ids.others}/dismiss`),
      t.post(`/api/v1/notifications/${t.seed.uuid()}/dismiss`),
      t.post('/api/v1/notifications/not-an-id/dismiss'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(t.remaining()).toHaveLength(5);
    expect(t.events('notification.notificationDismissed')).toHaveLength(0);
  });

  it('トークンがないと 401、write:notifications を満たさないスコープは 403 にして消さない', async () => {
    const t = await seedNotifications();
    const readOnly = await t.bearerFor('read');

    const responses = await Promise.all([
      t.request(`/api/v1/notifications/${t.ids.like}/dismiss`, { method: 'POST' }),
      t.post(`/api/v1/notifications/${t.ids.like}/dismiss`, readOnly),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 403]);
    expect(t.remaining()).toHaveLength(5);
  });

  it('Cookie の利用者は同一オリジンのときだけ消せ、Origin が違うか欠けると 403 にする', async () => {
    const t = await seedNotifications();
    const cookie = { Cookie: `sessionId=${t.me.sessionId}` };

    const cross = await t.post(`/api/v1/notifications/${t.ids.like}/dismiss`, {
      ...cookie,
      Origin: 'https://evil.example',
    });
    const missing = await t.post(`/api/v1/notifications/${t.ids.like}/dismiss`, cookie);
    const same = await t.post(`/api/v1/notifications/${t.ids.like}/dismiss`, { ...cookie, Origin: ORIGIN });

    expect([cross.status, missing.status, same.status]).toEqual([403, 403, 200]);
    expect(t.remaining()).toHaveLength(4);
  });
});

describe('POST /api/v2/notifications/:group_key/dismiss', () => {
  it('ungrouped-<通知ID> の通知を消して {} を返す', async () => {
    const t = await seedNotifications();

    const response = await t.post(`/api/v2/notifications/ungrouped-${t.ids.follow}/dismiss`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(t.remaining()).not.toContain(t.ids.follow);
    expect(t.remaining()).toHaveLength(4);
  });

  it('ungrouped- 以外の形と不正な ID は 404 にして何も消さない', async () => {
    const t = await seedNotifications();

    const responses = await Promise.all([
      t.post(`/api/v2/notifications/${t.ids.follow}/dismiss`),
      t.post(`/api/v2/notifications/grouped-${t.ids.follow}/dismiss`),
      t.post(`/api/v2/notifications/favourite-${t.ids.like}-1/dismiss`),
      t.post('/api/v2/notifications/ungrouped-not-an-id/dismiss'),
      t.post('/api/v2/notifications/ungrouped-/dismiss'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
    expect(t.remaining()).toHaveLength(5);
  });

  it('他人の通知は 404 にして消さない', async () => {
    const t = await seedNotifications();

    const response = await t.post(`/api/v2/notifications/ungrouped-${t.ids.others}/dismiss`);

    expect(response.status).toBe(404);
    expect(t.remaining()).toHaveLength(5);
  });

  it('トークンがないと 401、write:notifications を満たさないスコープは 403 にする', async () => {
    const t = await seedNotifications();
    const readOnly = await t.bearerFor('read');

    const responses = await Promise.all([
      t.request(`/api/v2/notifications/ungrouped-${t.ids.like}/dismiss`, { method: 'POST' }),
      t.post(`/api/v2/notifications/ungrouped-${t.ids.like}/dismiss`, readOnly),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 403]);
    expect(t.remaining()).toHaveLength(5);
  });
});
