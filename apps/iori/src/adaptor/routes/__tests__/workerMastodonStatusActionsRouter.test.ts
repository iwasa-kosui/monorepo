import { Announce, Like, Note, Person, Undo } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const notFound = { error: 'Record not found' };

const seedActions = async () => {
  const t = setupReadApi();
  const me = await t.signIn('read write');
  const alice = t.seed.addRemoteActor('alice');
  const local = t.seed.addLocalPost(me, 1_000);
  const publicNote = t.seed.addRemotePost(alice, 2_000, { visibility: 'public', timeline: false });
  const post = (path: string, headers: Record<string, string> = me.bearer) =>
    t.request(path, { method: 'POST', headers });
  const count = (table: string, where = '1=1') =>
    Number((t.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number | bigint }).n);
  const serveRemoteNote = (note: { uri: string }) =>
    t.federation.lookupObject.mockResolvedValue(
      new Note({
        id: new URL(note.uri),
        content: 'remote',
        to: new URL('https://www.w3.org/ns/activitystreams#Public'),
        attribution: new Person({
          id: new URL(`https://remote.example/users/${alice.username}`),
          inbox: new URL(`https://remote.example/users/${alice.username}/inbox`),
        }),
      }),
    );
  const aliceInbox = new URL(`https://remote.example/users/${alice.username}/inbox`);
  return { ...t, aliceInbox, me, alice, local, publicNote, post, count, serveRemoteNote };
};

describe('POST /api/v1/statuses/:id/favourite と /unfavourite', () => {
  it('ローカルの投稿をいいねして、favourited と favourites_count を反映した Status を返す', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/statuses/${t.local.postId}/favourite`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      id: t.local.postId,
      favourited: true,
      favourites_count: 1,
    });
    expect(t.count('likes', `postId='${t.local.postId}' AND actorId='${t.me.actorId}'`)).toBe(1);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('いいね済みでもエラーにせず、現在の状態を返して likes を増やさない', async () => {
    const t = await seedActions();
    await t.post(`/api/v1/statuses/${t.local.postId}/favourite`);

    const response = await t.post(`/api/v1/statuses/${t.local.postId}/favourite`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({ favourited: true, favourites_count: 1 });
    expect(t.count('likes')).toBe(1);
  });

  it('いいねを取り消し、favourited と favourites_count を戻した Status を返す', async () => {
    const t = await seedActions();
    await t.post(`/api/v1/statuses/${t.local.postId}/favourite`);

    const response = await t.post(`/api/v1/statuses/${t.local.postId}/unfavourite`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({ favourited: false, favourites_count: 0 });
    expect(t.count('likes')).toBe(0);
  });

  it('未いいねでもエラーにせず、現在の状態を返す', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/statuses/${t.local.postId}/unfavourite`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({ favourited: false, favourites_count: 0 });
  });

  it('リモートの投稿は元のサーバーへ Like と Undo を送る', async () => {
    const t = await seedActions();
    t.serveRemoteNote(t.publicNote);

    const liked = await t.post(`/api/v1/statuses/${t.publicNote.postId}/favourite`);
    const unliked = await t.post(`/api/v1/statuses/${t.publicNote.postId}/unfavourite`);

    expect(StatusSchema.parse(await liked.json())).toMatchObject({ favourited: true, favourites_count: 1 });
    expect(StatusSchema.parse(await unliked.json())).toMatchObject({ favourited: false, favourites_count: 0 });
    const sent = t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBeInstanceOf(Like);
    expect(sent[1]).toBeInstanceOf(Undo);
  });

  it('リモートの投稿を取得できないときは 502 にする', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/statuses/${t.publicNote.postId}/favourite`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'The remote server could not be reached' });
    expect(t.count('likes')).toBe(0);
  });

  it('リモートの投稿を取得できずに 502 になった後の再試行で Like を送る', async () => {
    const t = await seedActions();

    const failed = await t.post(`/api/v1/statuses/${t.publicNote.postId}/favourite`);
    t.serveRemoteNote(t.publicNote);
    const retried = await t.post(`/api/v1/statuses/${t.publicNote.postId}/favourite`);

    expect(failed.status).toBe(502);
    expect(retried.status).toBe(200);
    expect(t.count('likes')).toBe(1);
    const sent = t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(Like);
  });

  it('相手が投稿を消していて取得できなくても、いいねを取り消し、DB の投稿者の inbox へ Undo を送る', async () => {
    const t = await seedActions();
    t.serveRemoteNote(t.publicNote);
    await t.post(`/api/v1/statuses/${t.publicNote.postId}/favourite`);
    t.federation.lookupObject.mockResolvedValue(null);

    const response = await t.post(`/api/v1/statuses/${t.publicNote.postId}/unfavourite`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({ favourited: false, favourites_count: 0 });
    expect(t.count('likes')).toBe(0);
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(2);
    const [, recipient, undo] = t.federation.sendActivity.mock.calls[1] as unknown as [unknown, unknown, unknown];
    expect(recipient).toEqual({
      id: new URL(`https://remote.example/users/${t.alice.username}`),
      inboxId: t.aliceInbox,
    });
    expect(undo).toBeInstanceOf(Undo);
    expect(await (undo as Undo).getObject()).toBeInstanceOf(Like);
  });

  it('閲覧者に見えないリモートの投稿は 404 にして likes を増やさない', async () => {
    const t = await seedActions();
    const hidden = [
      t.seed.addRemotePost(t.alice, 2_100, { visibility: 'private', timeline: false }),
      t.seed.addRemotePost(t.alice, 2_200, { visibility: 'direct', timeline: false }),
    ];

    const responses = await Promise.all(hidden.map((note) => t.post(`/api/v1/statuses/${note.postId}/favourite`)));

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
    expect(t.count('likes')).toBe(0);
  });

  it('存在しない投稿、削除済みの投稿、不正な ID は 404 にする', async () => {
    const t = await seedActions();
    const deleted = t.seed.addLocalPost(t.me, 3_000, { deletedAt: 4_000 });

    const responses = await Promise.all([
      t.post(`/api/v1/statuses/${t.seed.uuid()}/favourite`),
      t.post(`/api/v1/statuses/${deleted.postId}/favourite`),
      t.post('/api/v1/statuses/not-an-id/unfavourite'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
    expect(t.count('likes')).toBe(0);
  });

  it('トークンがないと 401、write:favourites を満たさないスコープは 403 にする', async () => {
    const t = await seedActions();
    const readOnly = await t.bearerFor('read');
    const statusesOnly = await t.bearerFor('write:statuses');

    const responses = await Promise.all([
      t.request(`/api/v1/statuses/${t.local.postId}/favourite`, { method: 'POST' }),
      t.post(`/api/v1/statuses/${t.local.postId}/favourite`, { Authorization: 'Bearer invalid' }),
      t.post(`/api/v1/statuses/${t.local.postId}/favourite`, readOnly),
      t.post(`/api/v1/statuses/${t.local.postId}/unfavourite`, statusesOnly),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403]);
    expect(t.count('likes')).toBe(0);
  });

  it('write:favourites だけのトークンでいいねできる', async () => {
    const t = setupReadApi();
    const me = await t.signIn('write:favourites');
    const post = t.seed.addLocalPost(me, 1_000);

    const response = await t.request(`/api/v1/statuses/${post.postId}/favourite`, {
      method: 'POST',
      headers: me.bearer,
    });

    expect(response.status).toBe(200);
  });

  it('Cookie の利用者は同一オリジンのときだけ操作でき、Origin が違うか欠けると 403 にする', async () => {
    const t = await seedActions();
    const cookie = { Cookie: `sessionId=${t.me.sessionId}` };

    const same = await t.post(`/api/v1/statuses/${t.local.postId}/favourite`, { ...cookie, Origin: ORIGIN });
    const secFetch = await t.post(`/api/v1/statuses/${t.local.postId}/unfavourite`, {
      ...cookie,
      'Sec-Fetch-Site': 'same-origin',
    });
    const cross = await t.post(`/api/v1/statuses/${t.local.postId}/favourite`, {
      ...cookie,
      Origin: 'https://evil.example',
    });
    const missing = await t.post(`/api/v1/statuses/${t.local.postId}/favourite`, cookie);

    expect([same.status, secFetch.status, cross.status, missing.status]).toEqual([200, 200, 403, 403]);
    expect(t.count('likes')).toBe(0);
  });
});

describe('POST /api/v1/statuses/:id/reblog と /unreblog', () => {
  it('ローカルの投稿をブーストし、ブーストの Status に元の Status を入れて返す', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/statuses/${t.local.postId}/reblog`);

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    const row = t.sqlite.prepare('SELECT repostId FROM reposts WHERE postId = ?').get(t.local.postId) as {
      repostId: string;
    };
    expect(status).toMatchObject({
      id: row.repostId,
      account: { id: t.me.actorId },
      reblog: { id: t.local.postId, reblogged: true, reblogs_count: 1 },
      reblogged: true,
    });
    expect(t.count('timeline_items', `repostId='${row.repostId}' AND deletedAt IS NULL`)).toBe(1);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('ブースト済みでもエラーにせず、同じ ID のブーストを返して reposts を増やさない', async () => {
    const t = await seedActions();
    const first = StatusSchema.parse(await (await t.post(`/api/v1/statuses/${t.local.postId}/reblog`)).json());

    const response = await t.post(`/api/v1/statuses/${t.local.postId}/reblog`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({ id: first.id, reblog: { reblogs_count: 1 } });
    expect(t.count('reposts')).toBe(1);
  });

  it('リモートの public と unlisted の投稿をブーストして Announce を送る', async () => {
    const t = await seedActions();
    const unlisted = t.seed.addRemotePost(t.alice, 2_100, { visibility: 'unlisted', timeline: false });
    t.serveRemoteNote(t.publicNote);

    const response = await t.post(`/api/v1/statuses/${t.publicNote.postId}/reblog`);
    t.serveRemoteNote(unlisted);
    const second = await t.post(`/api/v1/statuses/${unlisted.postId}/reblog`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      reblog: { id: t.publicNote.postId, visibility: 'public', reblogged: true },
    });
    expect(second.status).toBe(200);
    const sent = t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBeInstanceOf(Announce);
    expect(t.count('reposts')).toBe(2);
  });

  it('リモートの private、direct、公開範囲の記録がない投稿は 422 にして何も作らない', async () => {
    const t = await seedActions();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    const hidden = [
      t.seed.addRemotePost(t.alice, 2_100, { visibility: 'private', timeline: false }),
      t.seed.addRemotePost(t.alice, 2_200, {
        visibility: 'direct',
        timeline: false,
        recipientActorUris: [`${ORIGIN}/users/${t.me.username}`],
      }),
      t.seed.addRemotePost(t.alice, 2_300, { visibility: null, timeline: false }),
    ];

    const responses = await Promise.all(hidden.map((note) => t.post(`/api/v1/statuses/${note.postId}/reblog`)));

    expect(responses.map((response) => response.status)).toEqual([422, 422, 422]);
    expect(await responses[0]!.json()).toEqual({
      error: 'Validation failed: Private and direct statuses cannot be reblogged',
    });
    expect(t.count('reposts')).toBe(0);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('DB では public でも取得し直すと private の投稿は 422 にして Announce を送らず何も作らない', async () => {
    const t = await seedActions();
    const followers = new URL(`https://remote.example/users/${t.alice.username}/followers`);
    t.federation.lookupObject.mockResolvedValue(
      new Note({
        id: new URL(t.publicNote.uri),
        content: 'remote',
        to: followers,
        attribution: new Person({
          id: new URL(`https://remote.example/users/${t.alice.username}`),
          inbox: new URL(`https://remote.example/users/${t.alice.username}/inbox`),
          followers,
        }),
      }),
    );

    const response = await t.post(`/api/v1/statuses/${t.publicNote.postId}/reblog`);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Validation failed: Private and direct statuses cannot be reblogged',
    });
    expect(t.count('reposts')).toBe(0);
    expect(t.count('timeline_items', 'type=\'repost\'')).toBe(0);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('DB では public でも取得し直した Note に宛先がないと 422 にして Announce を送らず何も作らない', async () => {
    const t = await seedActions();
    t.federation.lookupObject.mockResolvedValue(
      new Note({
        id: new URL(t.publicNote.uri),
        content: 'remote',
        attribution: new Person({
          id: new URL(`https://remote.example/users/${t.alice.username}`),
          inbox: t.aliceInbox,
        }),
      }),
    );

    const response = await t.post(`/api/v1/statuses/${t.publicNote.postId}/reblog`);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Validation failed: Private and direct statuses cannot be reblogged',
    });
    expect(t.count('reposts')).toBe(0);
    expect(t.count('timeline_items', 'type=\'repost\'')).toBe(0);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('リモートの投稿を取得できないときは 502 にして何も作らない', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/statuses/${t.publicNote.postId}/reblog`);

    expect(response.status).toBe(502);
    expect(t.count('reposts')).toBe(0);
  });

  it('相手が投稿を消していて取得できなくても、ブーストを取り消し、DB の投稿者の inbox へ Undo Announce を送る', async () => {
    const t = await seedActions();
    t.serveRemoteNote(t.publicNote);
    await t.post(`/api/v1/statuses/${t.publicNote.postId}/reblog`);
    t.federation.lookupObject.mockResolvedValue(null);

    const response = await t.post(`/api/v1/statuses/${t.publicNote.postId}/unreblog`);

    expect(response.status).toBe(200);
    expect(t.count('reposts')).toBe(0);
    expect(t.count('timeline_items', 'type=\'repost\' AND deletedAt IS NULL')).toBe(0);
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(2);
    const [, recipient, undo] = t.federation.sendActivity.mock.calls[1] as unknown as [unknown, unknown, unknown];
    expect(recipient).toEqual({
      id: new URL(`https://remote.example/users/${t.alice.username}`),
      inboxId: t.aliceInbox,
    });
    expect(undo).toBeInstanceOf(Undo);
    expect(await (undo as Undo).getObject()).toBeInstanceOf(Announce);
  });

  it('ブーストを取り消し、元の Status を返して reposts と timeline_items を消す', async () => {
    const t = await seedActions();
    await t.post(`/api/v1/statuses/${t.local.postId}/reblog`);

    const response = await t.post(`/api/v1/statuses/${t.local.postId}/unreblog`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      id: t.local.postId,
      reblog: null,
      reblogged: false,
      reblogs_count: 0,
    });
    expect(t.count('reposts')).toBe(0);
    expect(t.count('timeline_items', 'type=\'repost\' AND deletedAt IS NULL')).toBe(0);
  });

  it('未ブーストでもエラーにせず、現在の状態を返す', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/statuses/${t.local.postId}/unreblog`);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({ id: t.local.postId, reblogged: false });
  });

  it('リモートの投稿のブーストを取り消すと Undo を送る', async () => {
    const t = await seedActions();
    t.serveRemoteNote(t.publicNote);
    await t.post(`/api/v1/statuses/${t.publicNote.postId}/reblog`);

    const response = await t.post(`/api/v1/statuses/${t.publicNote.postId}/unreblog`);

    expect(response.status).toBe(200);
    const sent = t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
    expect(sent[1]).toBeInstanceOf(Undo);
    expect(t.count('reposts')).toBe(0);
  });

  it('存在しない投稿と不正な ID は 404 にする', async () => {
    const t = await seedActions();

    const responses = await Promise.all([
      t.post(`/api/v1/statuses/${t.seed.uuid()}/reblog`),
      t.post('/api/v1/statuses/not-an-id/unreblog'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
  });

  it('トークンがないと 401、write:statuses を満たさないスコープは 403 にする', async () => {
    const t = await seedActions();
    const readOnly = await t.bearerFor('read');
    const favouritesOnly = await t.bearerFor('write:favourites');

    const responses = await Promise.all([
      t.request(`/api/v1/statuses/${t.local.postId}/reblog`, { method: 'POST' }),
      t.post(`/api/v1/statuses/${t.local.postId}/reblog`, readOnly),
      t.post(`/api/v1/statuses/${t.local.postId}/unreblog`, favouritesOnly),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 403, 403]);
    expect(t.count('reposts')).toBe(0);
  });

  it('Cookie の利用者は同一オリジンのときだけ操作でき、Origin が違うか欠けると 403 にする', async () => {
    const t = await seedActions();
    const cookie = { Cookie: `sessionId=${t.me.sessionId}` };

    const same = await t.post(`/api/v1/statuses/${t.local.postId}/reblog`, { ...cookie, Origin: ORIGIN });
    const cross = await t.post(`/api/v1/statuses/${t.local.postId}/unreblog`, {
      ...cookie,
      Origin: 'https://evil.example',
    });
    const missing = await t.post(`/api/v1/statuses/${t.local.postId}/unreblog`, cookie);

    expect([same.status, cross.status, missing.status]).toEqual([200, 403, 403]);
    expect(t.count('reposts')).toBe(1);
  });
});
