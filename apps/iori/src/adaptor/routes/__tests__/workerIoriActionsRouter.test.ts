import { EmojiReact, Note, Person } from '@fedify/fedify';
import { describe, expect, it } from 'vitest';

import { StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const notFound = { error: 'Record not found' };

const seedReactions = async (scope = 'read write') => {
  const t = setupReadApi();
  const me = await t.signIn(scope);
  const alice = t.seed.addRemoteActor('alice');
  const local = t.seed.addLocalPost(me, 1_000);
  const publicNote = t.seed.addRemotePost(alice, 2_000, { visibility: 'public', timeline: false });
  const reactionPath = (postId: string, emoji = ':wave:') =>
    `/api/iori/v1/statuses/${postId}/reactions/${encodeURIComponent(emoji)}`;
  const put = (postId: string, emoji = ':wave:', headers: Record<string, string> = me.bearer) =>
    t.request(reactionPath(postId, emoji), { method: 'PUT', headers });
  const del = (postId: string, emoji = ':wave:', headers: Record<string, string> = me.bearer) =>
    t.request(reactionPath(postId, emoji), { method: 'DELETE', headers });
  const count = (where = '1=1') =>
    Number(
      (t.sqlite.prepare(`SELECT count(*) AS n FROM emoji_reacts WHERE ${where}`).get() as { n: number | bigint }).n,
    );
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
  return { ...t, me, alice, local, publicNote, reactionPath, put, del, count, serveRemoteNote };
};

const jsonPost = (path: string, headers: Record<string, string>, body: unknown) => ({
  path,
  init: {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  },
});

describe('POST /api/iori/v1/preview', () => {
  const preview = async (
    t: Awaited<ReturnType<typeof seedReactions>>,
    headers: Record<string, string>,
    body: unknown,
  ) => {
    const { path, init } = jsonPost('/api/iori/v1/preview', headers, body);
    return t.request(path, init);
  };

  it('Markdown を HTML にして、危険なタグを取り除いて返す', async () => {
    const t = await seedReactions('write:statuses');

    const response = await preview(t, t.me.bearer, { markdown: '**bold**<script>alert(1)</script>' });

    expect(response.status).toBe(200);
    const body = await response.json() as { html: string };
    expect(body.html).toContain('<strong>bold</strong>');
    expect(body.html).not.toContain('<script>');
  });

  it('Cookie の利用者は同一オリジンのときだけ使える', async () => {
    const t = await seedReactions();
    const cookie = { Cookie: `sessionId=${t.me.sessionId}` };

    const same = await preview(t, { ...cookie, Origin: ORIGIN }, { markdown: 'text' });
    const missing = await preview(t, cookie, { markdown: 'text' });

    expect([same.status, missing.status]).toEqual([200, 403]);
  });

  it('トークンがないと 401、write:statuses を満たさないスコープは 403 にする', async () => {
    const t = await seedReactions();

    const responses = await Promise.all([
      preview(t, {}, { markdown: 'text' }),
      preview(t, { Authorization: 'Bearer invalid' }, { markdown: 'text' }),
      preview(t, await t.bearerFor('read'), { markdown: 'text' }),
      preview(t, await t.bearerFor('write:favourites'), { markdown: 'text' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403]);
  });

  it.each([
    ['markdown がない', {}],
    ['markdown が文字列でない', { markdown: 1 }],
  ])('%s と 422 にする', async (_name, body) => {
    const t = await seedReactions();

    const response = await preview(t, t.me.bearer, body);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: markdown' });
  });
});

describe('PUT と DELETE /api/iori/v1/statuses/:id/reactions/:emoji', () => {
  it('ローカルの投稿に反応し、iori.reactions に反映した Status を返す', async () => {
    const t = await seedReactions();

    const response = await t.put(t.local.postId);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      id: t.local.postId,
      iori: { reactions: [{ emoji: ':wave:', count: 1, me: true }] },
    });
    expect(t.count(`postId='${t.local.postId}' AND actorId='${t.me.actorId}'`)).toBe(1);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('URL エンコードされた絵文字を 1 回だけデコードして使う', async () => {
    const t = await seedReactions();

    const wave = await t.put(t.local.postId, ':wave:');
    const thumbs = await t.put(t.local.postId, '👍');
    const percent = await t.put(t.local.postId, '100%');

    expect([wave.status, thumbs.status, percent.status]).toEqual([200, 200, 200]);
    const emojis = (t.sqlite.prepare('SELECT emoji FROM emoji_reacts ORDER BY emoji').all() as { emoji: string }[])
      .map((row) => row.emoji);
    expect(emojis).toEqual(['100%', ':wave:', '👍']);
  });

  it('反応済みでもエラーにせず、現在の状態を返して emoji_reacts を増やさない', async () => {
    const t = await seedReactions();
    await t.put(t.local.postId);

    const response = await t.put(t.local.postId);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      iori: { reactions: [{ emoji: ':wave:', count: 1, me: true }] },
    });
    expect(t.count()).toBe(1);
  });

  it('反応を取り消し、iori.reactions から外した Status を返す', async () => {
    const t = await seedReactions();
    await t.put(t.local.postId);

    const response = await t.del(t.local.postId);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({ id: t.local.postId, iori: { reactions: [] } });
    expect(t.count()).toBe(0);
  });

  it('未反応でもエラーにせず、現在の状態を返す', async () => {
    const t = await seedReactions();

    const response = await t.del(t.local.postId);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({ iori: { reactions: [] } });
  });

  it('リモートの投稿は元のサーバーへ EmojiReact を送る', async () => {
    const t = await seedReactions();
    t.serveRemoteNote(t.publicNote);

    const response = await t.put(t.publicNote.postId);

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      iori: { reactions: [{ emoji: ':wave:', count: 1, me: true }] },
    });
    const sent = t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(EmojiReact);
  });

  it('リモートの投稿を取得できないときは 502 にする', async () => {
    const t = await seedReactions();

    const response = await t.put(t.publicNote.postId);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'The remote server could not be reached' });
  });

  it('閲覧者に見えないリモートの投稿は 404 にして emoji_reacts を増やさない', async () => {
    const t = await seedReactions();
    const hidden = [
      t.seed.addRemotePost(t.alice, 2_100, { visibility: 'private', timeline: false }),
      t.seed.addRemotePost(t.alice, 2_200, { visibility: 'direct', timeline: false }),
    ];

    const responses = await Promise.all([
      ...hidden.map((note) => t.put(note.postId)),
      ...hidden.map((note) => t.del(note.postId)),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
    expect(t.count()).toBe(0);
  });

  it('存在しない投稿、削除済みの投稿、不正な ID は 404 にする', async () => {
    const t = await seedReactions();
    const deleted = t.seed.addLocalPost(t.me, 3_000, { deletedAt: 4_000 });

    const responses = await Promise.all([
      t.put(t.seed.uuid()),
      t.put(deleted.postId),
      t.del('not-an-id'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
    expect(t.count()).toBe(0);
  });

  it('絵文字が 128 文字を超えると 422 にする', async () => {
    const t = await seedReactions();

    const responses = await Promise.all([
      t.put(t.local.postId, 'a'.repeat(129)),
      t.del(t.local.postId, 'a'.repeat(129)),
    ]);

    expect(responses.map((response) => response.status)).toEqual([422, 422]);
    expect(await responses[0]!.json()).toEqual({ error: 'Validation failed: emoji' });
    expect(t.count()).toBe(0);
  });

  it('トークンがないと 401、write:favourites を満たさないスコープは 403 にする', async () => {
    const t = await seedReactions();
    const readOnly = await t.bearerFor('read');
    const statusesOnly = await t.bearerFor('write:statuses');

    const responses = await Promise.all([
      t.put(t.local.postId, ':wave:', {}),
      t.put(t.local.postId, ':wave:', { Authorization: 'Bearer invalid' }),
      t.put(t.local.postId, ':wave:', readOnly),
      t.del(t.local.postId, ':wave:', {}),
      t.del(t.local.postId, ':wave:', statusesOnly),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 401, 403]);
    expect(t.count()).toBe(0);
  });

  it('write:favourites だけのトークンで反応できる', async () => {
    const t = await seedReactions('write:favourites');

    const response = await t.put(t.local.postId);

    expect(response.status).toBe(200);
  });

  it('Cookie の利用者は同一オリジンのときだけ操作でき、Origin が欠けると 403 にする', async () => {
    const t = await seedReactions();
    const cookie = { Cookie: `sessionId=${t.me.sessionId}` };

    const same = await t.put(t.local.postId, ':wave:', { ...cookie, Origin: ORIGIN });
    const missing = await t.del(t.local.postId, ':wave:', cookie);

    expect([same.status, missing.status]).toEqual([200, 403]);
    expect(t.count()).toBe(1);
  });
});

describe('GET と POST /api/iori/v1/relays', () => {
  const relayActor = 'https://relay.example/actor';
  const serveRelayActor = (t: Awaited<ReturnType<typeof seedReactions>>) =>
    t.federation.getDocumentLoader.mockResolvedValue(
      async () => ({ document: { id: relayActor, inbox: 'https://relay.example/inbox' } }),
    );
  const subscribe = (t: Awaited<ReturnType<typeof seedReactions>>, headers: Record<string, string>, body: unknown) => {
    const { path, init } = jsonPost('/api/iori/v1/relays', headers, body);
    return t.request(path, init);
  };

  it('GET は購読しているリレーを relays に入れて返す', async () => {
    const t = await seedReactions('read');
    const relayId = t.seed.addRelay();

    const response = await t.request('/api/iori/v1/relays', { headers: t.me.bearer });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      relays: [{ relayId, actorUri: `https://relay.example/${relayId}`, status: 'accepted' }],
    });
  });

  it('POST はリレーの購読を始め、success と relay を返す', async () => {
    const t = await seedReactions('write');
    serveRelayActor(t);

    const response = await subscribe(t, t.me.bearer, { url: relayActor });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      relay: { actorUri: relayActor, inboxUrl: 'https://relay.example/inbox', status: 'pending' },
    });
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
    const listed = await t.request('/api/iori/v1/relays', { headers: await t.bearerFor('read') });
    expect(await listed.json()).toMatchObject({ relays: [{ actorUri: relayActor }] });
  });

  it('POST はリレーのアクターを取得できないと 400 にする', async () => {
    const t = await seedReactions('write');

    const response = await subscribe(t, t.me.bearer, { url: relayActor });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Failed to subscribe to relay') });
  });

  it('トークンがないと 401、スコープが足りないと 403 にする', async () => {
    const t = await seedReactions();
    const writeOnly = await t.bearerFor('write:statuses');
    const readOnly = await t.bearerFor('read');

    const responses = await Promise.all([
      t.request('/api/iori/v1/relays'),
      t.request('/api/iori/v1/relays', { headers: { Authorization: 'Bearer invalid' } }),
      t.request('/api/iori/v1/relays', { headers: writeOnly }),
      subscribe(t, {}, { url: relayActor }),
      subscribe(t, readOnly, { url: relayActor }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 401, 403]);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['url がない', {}],
    ['url が文字列でない', { url: 1 }],
    ['url が URL でない', { url: 'not a url' }],
  ])('POST は %s と 422 にする', async (_name, body) => {
    const t = await seedReactions('write');

    const response = await subscribe(t, t.me.bearer, body);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: url' });
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });
});
