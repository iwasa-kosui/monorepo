import {
  Announce,
  Collection,
  Create,
  Emoji,
  EmojiReact,
  Image,
  Note,
  OrderedCollection,
  OrderedCollectionPage,
  Person,
} from '@fedify/vocab';
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it, vi } from 'vitest';

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
  const serveRemoteNote = (note: { uri: string }, tags: Emoji[] = []) =>
    t.federation.lookupObject.mockResolvedValue(
      new Note({
        id: new URL(note.uri),
        content: 'remote',
        to: new URL('https://www.w3.org/ns/activitystreams#Public'),
        tags,
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

  it('リモートが URL 付きで付けた同名の反応と 1 件にまとめ、取り消すとリモートの分だけが残る', async () => {
    const t = await seedReactions();
    const url = 'https://remote.example/emoji/wave.png';
    t.seed.addEmojiReact(t.alice.actorId, t.local.postId, ':wave:', url);

    const put = await t.put(t.local.postId);
    const del = await t.del(t.local.postId);

    expect(put.status).toBe(200);
    expect(StatusSchema.parse(await put.json())).toMatchObject({
      iori: { reactions: [{ emoji: ':wave:', count: 2, url, me: true }] },
    });
    expect(del.status).toBe(200);
    expect(StatusSchema.parse(await del.json())).toMatchObject({
      iori: { reactions: [{ emoji: ':wave:', count: 1, url, me: false }] },
    });
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

  describe('リモートの投稿へのカスタム絵文字の反応', () => {
    const emojiTag = (name: string, url: string) =>
      new Emoji({
        id: new URL(`https://remote.example/emojis/${name.replaceAll(':', '')}`),
        name,
        icon: new Image({ url: new URL(url), mediaType: 'image/png' }),
      });
    const selfEmojiImageUrl = (t: Awaited<ReturnType<typeof seedReactions>>, emoji: string) =>
      (t.sqlite.prepare('SELECT emojiImageUrl FROM emoji_reacts WHERE actorId = ? AND emoji = ?').get(
        t.me.actorId,
        emoji,
      ) as { emojiImageUrl: string | null }).emojiImageUrl;
    const sentReact = (t: Awaited<ReturnType<typeof seedReactions>>) => {
      const sent = t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
      expect(sent).toHaveLength(1);
      return sent[0] as EmojiReact;
    };
    const tagsOf = async (react: EmojiReact) => {
      const tags: Emoji[] = [];
      for await (const tag of react.getTags()) {
        tags.push(tag as Emoji);
      }
      return tags;
    };

    it('投稿に同名の Emoji があるとき、tag に同じ Emoji を付けて送り、icon の url を保存する', async () => {
      const t = await seedReactions();
      const url = 'https://remote.example/emoji/wave.png';
      t.serveRemoteNote(t.publicNote, [
        emojiTag(':other:', 'https://remote.example/emoji/other.png'),
        emojiTag(':wave:', url),
      ]);

      const response = await t.put(t.publicNote.postId);

      expect(response.status).toBe(200);
      expect(StatusSchema.parse(await response.json())).toMatchObject({
        iori: { reactions: [{ emoji: ':wave:', count: 1, url, me: true }] },
      });
      const tags = await tagsOf(sentReact(t));
      expect(tags).toHaveLength(1);
      expect(tags[0]).toBeInstanceOf(Emoji);
      expect(tags[0]!.name?.toString()).toBe(':wave:');
      expect((await tags[0]!.getIcon())?.url?.toString()).toBe(url);
      expect(selfEmojiImageUrl(t, ':wave:')).toBe(url);
    });

    it('投稿に同名の Emoji が無いとき、tag なしで送り、emojiImageUrl は null にする', async () => {
      const t = await seedReactions();
      t.serveRemoteNote(t.publicNote, [emojiTag(':other:', 'https://remote.example/emoji/other.png')]);

      const response = await t.put(t.publicNote.postId);

      expect(response.status).toBe(200);
      expect(await tagsOf(sentReact(t))).toHaveLength(0);
      expect(selfEmojiImageUrl(t, ':wave:')).toBeNull();
    });

    it('icon の url が https でないときは採用せず、tag なしで送る', async () => {
      const t = await seedReactions();
      t.serveRemoteNote(t.publicNote, [emojiTag(':wave:', 'http://remote.example/emoji/wave.png')]);

      const response = await t.put(t.publicNote.postId);

      expect(response.status).toBe(200);
      expect(await tagsOf(sentReact(t))).toHaveLength(0);
      expect(selfEmojiImageUrl(t, ':wave:')).toBeNull();
    });

    it('Emoji の icon の取得が失敗しても、反応は成功し、tag なしで送って emojiImageUrl は null にする', async () => {
      const t = await seedReactions();
      t.serveRemoteNote(t.publicNote, [
        new Emoji({
          id: new URL('https://remote.example/emojis/wave'),
          name: ':wave:',
          icon: new URL('https://remote.example/emoji/wave-icon'),
        }),
      ]);
      t.federation.getDocumentLoader.mockResolvedValue(async () => {
        throw new Error('icon fetch failed');
      });

      const response = await t.put(t.publicNote.postId);

      expect(response.status).toBe(200);
      expect(await tagsOf(sentReact(t))).toHaveLength(0);
      expect(selfEmojiImageUrl(t, ':wave:')).toBeNull();
    });

    it('icon の mediaType が image/ で始まらないときは、url は採用して tag を付け、mediaType は付けない', async () => {
      const t = await seedReactions();
      const url = 'https://remote.example/emoji/wave.png';
      t.serveRemoteNote(t.publicNote, [
        new Emoji({
          id: new URL('https://remote.example/emojis/wave'),
          name: ':wave:',
          icon: new Image({ url: new URL(url), mediaType: 'text/html' }),
        }),
      ]);

      const response = await t.put(t.publicNote.postId);

      expect(response.status).toBe(200);
      const tags = await tagsOf(sentReact(t));
      expect(tags).toHaveLength(1);
      const icon = await tags[0]!.getIcon();
      expect(icon?.url?.toString()).toBe(url);
      expect(icon?.mediaType).toBeNull();
      expect(selfEmojiImageUrl(t, ':wave:')).toBe(url);
    });

    it('iori が配信する :blobcat: は、投稿に同名の Emoji が無くても自前の画像を tag に付けて送る', async () => {
      const t = await seedReactions();
      const url = `${ORIGIN}/emoji/blobcat.png`;
      t.serveRemoteNote(t.publicNote, [emojiTag(':blobcat:', 'https://remote.example/emoji/blobcat.png')]);

      const response = await t.put(t.publicNote.postId, ':blobcat:');

      expect(response.status).toBe(200);
      expect(StatusSchema.parse(await response.json())).toMatchObject({
        iori: { reactions: [{ emoji: ':blobcat:', count: 1, url, me: true }] },
      });
      const tags = await tagsOf(sentReact(t));
      expect(tags).toHaveLength(1);
      expect(tags[0]!.name?.toString()).toBe(':blobcat:');
      const icon = await tags[0]!.getIcon();
      expect(icon?.url?.toString()).toBe(url);
      expect(icon?.mediaType).toBe('image/png');
      expect(selfEmojiImageUrl(t, ':blobcat:')).toBe(url);
    });
  });

  it('ローカルの投稿への :blobcat: は自前の画像の URL を付けて返す', async () => {
    const t = await seedReactions();

    const response = await t.put(t.local.postId, ':blobcat:');

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      iori: { reactions: [{ emoji: ':blobcat:', count: 1, url: `${ORIGIN}/emoji/blobcat.png`, me: true }] },
    });
  });

  it('リモートの投稿を取得できないときは 502 にする', async () => {
    const t = await seedReactions();

    const response = await t.put(t.publicNote.postId);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'The remote server could not be reached' });
    expect(t.count()).toBe(0);
  });

  it('リモートの投稿を取得できない取り消しは 502 にして、反応の行を消さない', async () => {
    const t = await seedReactions();
    t.seed.addEmojiReact(t.me.actorId, t.publicNote.postId, ':wave:');

    const response = await t.del(t.publicNote.postId);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'The remote server could not be reached' });
    expect(t.count()).toBe(1);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('検索の後に同じ反応が保存されて一意制約に違反しても、エラーにせず現在の状態を返す', async () => {
    const t = await seedReactions();
    t.seed.addEmojiReact(t.me.actorId, t.local.postId, ':wave:');
    const prepare = t.sqlite.prepare.bind(t.sqlite);
    let missed = false;
    vi.spyOn(t.sqlite, 'prepare').mockImplementation((sql) => {
      if (missed || !/from "emoji_reacts"[\s\S]*limit/i.test(sql)) return prepare(sql);
      missed = true;
      return { setReturnArrays: () => undefined, all: () => [] } as unknown as ReturnType<typeof prepare>;
    });

    const response = await t.put(t.local.postId);

    expect(missed).toBe(true);
    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      id: t.local.postId,
      iori: { reactions: [{ emoji: ':wave:', count: 1, me: true }] },
    });
    expect(t.count()).toBe(1);
  });

  it('フォローしていない相手の private の投稿は 404 にして、フォローすると反応できる', async () => {
    const t = await seedReactions();
    const followersOnly = t.seed.addRemotePost(t.alice, 2_300, { visibility: 'private', timeline: false });
    t.serveRemoteNote(followersOnly);

    const beforeFollow = await t.put(followersOnly.postId);
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    const afterFollow = await t.put(followersOnly.postId);

    expect(beforeFollow.status).toBe(404);
    expect(await beforeFollow.json()).toEqual(notFound);
    expect(afterFollow.status).toBe(200);
    expect(t.count(`postId='${followersOnly.postId}'`)).toBe(1);
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
    const t = await seedReactions('read write');
    serveRelayActor(t);

    const response = await subscribe(t, t.me.bearer, { url: relayActor });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      relay: { actorUri: relayActor, inboxUrl: 'https://relay.example/inbox', status: 'pending' },
    });
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
    const listed = await t.request('/api/iori/v1/relays', { headers: t.me.bearer });
    expect(await listed.json()).toMatchObject({ relays: [{ actorUri: relayActor }] });
  });

  it('POST はリレーのアクターを取得できないと 400 にする', async () => {
    const t = await seedReactions('write');

    const response = await subscribe(t, t.me.bearer, { url: relayActor });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Failed to subscribe to relay') });
  });

  it('所有者でないユーザーの POST は 403 にし、購読しない', async () => {
    const t = await seedReactions('read write');
    serveRelayActor(t);
    const other = await t.issueUserToken('write');
    t.seed.addLocalActor('other', other.userId);

    const response = await subscribe(t, { Authorization: `Bearer ${other.token}` }, { url: relayActor });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
    const listed = await t.request('/api/iori/v1/relays', { headers: t.me.bearer });
    expect(await listed.json()).toEqual({ relays: [] });
  });

  it('所有者でないユーザーの GET は 403 にする', async () => {
    const t = await seedReactions('read');
    t.seed.addRelay();
    const other = await t.issueUserToken('read');
    t.seed.addLocalActor('other', other.userId);

    const response = await t.request('/api/iori/v1/relays', { headers: { Authorization: `Bearer ${other.token}` } });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('所有者でないユーザーが不正な url を POST しても、422 ではなく 403 にする', async () => {
    const t = await seedReactions('write');
    const other = await t.issueUserToken('write');
    t.seed.addLocalActor('other', other.userId);

    const response = await subscribe(t, { Authorization: `Bearer ${other.token}` }, { url: 'not a url' });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
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

describe('POST /api/iori/v1/push/subscribe', () => {
  const endpoint = 'https://push.example/endpoint/1';
  const subscription = { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };
  const subscribe = (t: Awaited<ReturnType<typeof seedReactions>>, headers: Record<string, string>, body: unknown) => {
    const { path, init } = jsonPost('/api/iori/v1/push/subscribe', headers, body);
    return t.request(path, init);
  };
  const stored = (t: Awaited<ReturnType<typeof seedReactions>>) =>
    t.sqlite.prepare('SELECT userId, endpoint, p256dhKey, authKey FROM push_subscriptions').all();

  it('Bearer の利用者の購読を保存し、success を返す', async () => {
    const t = await seedReactions('push');

    const response = await subscribe(t, t.me.bearer, subscription);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(stored(t)).toEqual([
      { userId: t.me.userId, endpoint, p256dhKey: 'p256dh-key', authKey: 'auth-key' },
    ]);
  });

  it('購読済みの endpoint は 400 にして増やさない', async () => {
    const t = await seedReactions('push');
    await subscribe(t, t.me.bearer, subscription);

    const response = await subscribe(t, t.me.bearer, subscription);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'This endpoint is already subscribed.' });
    expect(stored(t)).toHaveLength(1);
  });

  it('Cookie の利用者は同一オリジンのときだけ使える', async () => {
    const t = await seedReactions();
    const cookie = { Cookie: `sessionId=${t.me.sessionId}` };

    const missing = await subscribe(t, cookie, subscription);
    const same = await subscribe(t, { ...cookie, Origin: ORIGIN }, subscription);

    expect([missing.status, same.status]).toEqual([403, 200]);
    expect(stored(t)).toHaveLength(1);
  });

  it('トークンがないと 401、push を満たさないスコープは 403 にする', async () => {
    const t = await seedReactions();

    const responses = await Promise.all([
      subscribe(t, {}, subscription),
      subscribe(t, { Authorization: 'Bearer invalid' }, subscription),
      subscribe(t, await t.bearerFor('read write'), subscription),
      subscribe(t, await t.bearerFor('write:statuses'), subscription),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403]);
    expect(stored(t)).toEqual([]);
  });

  it.each([
    ['本文がない', {}],
    ['endpoint が URL でない', { endpoint: 'not a url', keys: subscription.keys }],
    ['keys がない', { endpoint }],
    ['p256dh が空', { endpoint, keys: { p256dh: '', auth: 'auth-key' } }],
    ['auth がない', { endpoint, keys: { p256dh: 'p256dh-key' } }],
  ])('%s と 422 にする', async (_name, body) => {
    const t = await seedReactions('push');

    const response = await subscribe(t, t.me.bearer, body);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: subscription' });
    expect(stored(t)).toEqual([]);
  });
});

describe('POST /api/iori/v1/statuses/:id/remote-context', () => {
  const remoteContextPath = (postId: string) => `/api/iori/v1/statuses/${postId}/remote-context`;
  const post = (t: Awaited<ReturnType<typeof seedReactions>>, postId: string, headers: Record<string, string>) =>
    t.request(remoteContextPath(postId), { method: 'POST', headers });
  const remoteNote = (id: string, options: { replyTo?: string; replies?: Collection } = {}) =>
    new Note({
      id: new URL(id),
      content: 'remote',
      to: new URL('https://www.w3.org/ns/activitystreams#Public'),
      replyTarget: options.replyTo === undefined ? null : new URL(options.replyTo),
      replies: options.replies ?? null,
      attribution: new Person({
        id: new URL('https://remote.example/users/bob'),
        inbox: new URL('https://remote.example/users/bob/inbox'),
        preferredUsername: 'bob',
      }),
    });
  const storedCount = (t: Awaited<ReturnType<typeof seedReactions>>, uri: string) =>
    Number(
      (t.sqlite.prepare('SELECT count(*) AS n FROM remote_posts WHERE uri = ?').get(uri) as { n: number | bigint }).n,
    );

  it('相手のサーバーから取り込んだ返信を保存し、件数を返す', async () => {
    const t = await seedReactions();
    const replyUri = 'https://remote.example/notes/reply-1';
    const notes = new Map([
      [
        t.publicNote.uri,
        remoteNote(t.publicNote.uri, { replies: new Collection({ items: [new URL(replyUri)] }) }),
      ],
      [replyUri, remoteNote(replyUri, { replyTo: t.publicNote.uri })],
    ]);
    t.federation.lookupObject.mockImplementation(async (uri?: string) => notes.get(uri ?? '') ?? null);

    const response = await post(t, t.publicNote.postId, t.me.bearer);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ fetched: 1 });
    expect(storedCount(t, replyUri)).toBe(1);
    expect(t.federation.getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
  });

  it('トークンがないと 401、write:statuses を満たさないスコープは 403 にする', async () => {
    const t = await seedReactions();

    const responses = await Promise.all([
      post(t, t.publicNote.postId, {}),
      post(t, t.publicNote.postId, { Authorization: 'Bearer invalid' }),
      post(t, t.publicNote.postId, await t.bearerFor('read')),
      post(t, t.publicNote.postId, await t.bearerFor('read:statuses')),
      post(t, t.publicNote.postId, await t.bearerFor('write:favourites')),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403, 403]);
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });

  it('存在しない投稿、不正な ID、閲覧者に見えない投稿は 404 にして取得しない', async () => {
    const t = await seedReactions();
    const hidden = t.seed.addRemotePost(t.alice, 2_100, { visibility: 'private', timeline: false });

    const responses = await Promise.all([
      post(t, t.seed.uuid(), t.me.bearer),
      post(t, 'not-an-id', t.me.bearer),
      post(t, hidden.postId, t.me.bearer),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });
});

describe('GET /api/iori/v1/accounts/:id/remote-follows/:kind', () => {
  const followsPath = (actorId: string, kind: string, cursor?: string) =>
    `/api/iori/v1/accounts/${actorId}/remote-follows/${kind}${
      cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
    }`;
  const personOf = (name: string) =>
    new Person({
      id: new URL(`https://remote.example/users/${name}`),
      inbox: new URL(`https://remote.example/users/${name}/inbox`),
      preferredUsername: name,
      name: `${name} display`,
    });
  const serveFollowers = (t: Awaited<ReturnType<typeof seedReactions>>, names: readonly string[]) => {
    const alice = new Person({
      id: new URL('https://remote.example/users/alice'),
      inbox: new URL('https://remote.example/users/alice/inbox'),
      followers: new OrderedCollection({
        id: new URL('https://remote.example/users/alice/followers'),
        totalItems: 120,
        first: new OrderedCollectionPage({
          id: new URL('https://remote.example/users/alice/followers?page=1'),
          items: names.map((name) => new URL(`https://remote.example/users/${name}`)),
          next: new URL('https://remote.example/users/alice/followers?page=2'),
        }),
      }),
    });
    const byUri = new Map<string, unknown>([
      [alice.id!.href, alice],
      ...names.map((name): [string, Person] => [`https://remote.example/users/${name}`, personOf(name)]),
    ]);
    t.federation.lookupObject.mockImplementation(async (uri?: string) => byUri.get(uri ?? '') ?? null);
  };

  it('相手のサーバーのフォロワーを、アカウントとして返し、次のページと総数を付ける', async () => {
    const t = await seedReactions();
    serveFollowers(t, ['bob', 'carol']);

    const response = await t.request(followsPath(t.alice.actorId, 'followers'), { headers: t.me.bearer });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      accounts: { acct: string; display_name: string }[];
      next_cursor: string | null;
      total_items: number | null;
    };
    expect(body.accounts.map((account) => account.acct)).toEqual(['bob@remote.example', 'carol@remote.example']);
    expect(body.accounts[0]!.display_name).toBe('bob display');
    expect(body.next_cursor).toBe('https://remote.example/users/alice/followers?page=2');
    expect(body.total_items).toBe(120);
    expect(t.federation.getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
  });

  it('ローカルのアクターなら相手に問い合わせず空の一覧を返す', async () => {
    const t = await seedReactions();

    const response = await t.request(followsPath(t.me.actorId, 'following'), { headers: t.me.bearer });

    expect(await response.json()).toEqual({ accounts: [], next_cursor: null, total_items: null });
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });

  it('知らない種類やアクターは 404、URL でない cursor は 422 にする', async () => {
    const t = await seedReactions();

    const responses = await Promise.all([
      t.request(followsPath(t.alice.actorId, 'likes'), { headers: t.me.bearer }),
      t.request(followsPath('not-an-actor-id', 'followers'), { headers: t.me.bearer }),
      t.request(followsPath('00000000-0000-4000-8000-000000000000', 'followers'), { headers: t.me.bearer }),
      t.request(followsPath(t.alice.actorId, 'followers', 'not a url'), { headers: t.me.bearer }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 422]);
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });

  it('トークンがないと 401、read:accounts を満たさないスコープは 403 にする', async () => {
    const t = await seedReactions();

    const responses = await Promise.all([
      t.request(followsPath(t.alice.actorId, 'followers'), {}),
      t.request(followsPath(t.alice.actorId, 'followers'), { headers: { Authorization: 'Bearer invalid' } }),
      t.request(followsPath(t.alice.actorId, 'followers'), { headers: await t.bearerFor('read:statuses') }),
      t.request(followsPath(t.alice.actorId, 'followers'), { headers: await t.bearerFor('write') }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403]);
  });
});

describe('POST /api/iori/v1/accounts/:id/remote-statuses', () => {
  const remoteStatusesPath = (actorId: string) => `/api/iori/v1/accounts/${actorId}/remote-statuses`;
  const post = (t: Awaited<ReturnType<typeof seedReactions>>, actorId: string, headers: Record<string, string>) =>
    t.request(remoteStatusesPath(actorId), { method: 'POST', headers });
  const authorOf = (name: string) =>
    new Person({
      id: new URL(`https://remote.example/users/${name}`),
      inbox: new URL(`https://remote.example/users/${name}/inbox`),
      preferredUsername: name,
    });
  const outboxNote = (id: string, published: string) =>
    new Note({
      id: new URL(id),
      content: id,
      published: Temporal.Instant.from(published),
      to: new URL('https://www.w3.org/ns/activitystreams#Public'),
      attribution: authorOf('alice'),
    });
  const serveOutbox = (
    t: Awaited<ReturnType<typeof seedReactions>>,
    items: ReadonlyArray<Create | Announce>,
    notes: ReadonlyArray<Note>,
  ) => {
    const alice = new Person({
      id: new URL('https://remote.example/users/alice'),
      inbox: new URL('https://remote.example/users/alice/inbox'),
      outbox: new OrderedCollection({
        id: new URL('https://remote.example/users/alice/outbox'),
        first: new OrderedCollectionPage({
          id: new URL('https://remote.example/users/alice/outbox?page=1'),
          items: [...items],
        }),
      }),
    });
    const byUri = new Map<string, unknown>([
      [alice.id!.href, alice],
      ...notes.map((note): [string, Note] => [note.id!.href, note]),
    ]);
    t.federation.lookupObject.mockImplementation(async (uri?: string) => byUri.get(uri ?? '') ?? null);
  };
  const createOf = (note: Note) =>
    new Create({ id: new URL(`${note.id!.href}/activity`), actor: authorOf('alice'), object: note });
  const storedRow = (t: Awaited<ReturnType<typeof seedReactions>>, uri: string) =>
    t.sqlite.prepare(
      'SELECT p.createdAt AS createdAt FROM remote_posts r JOIN posts p ON p.postId = r.postId WHERE r.uri = ?',
    ).get(uri) as { createdAt: number | bigint } | undefined;

  it('相手の outbox の Note を投稿日時つきで保存し、件数を返す。Announce は保存しない', async () => {
    const t = await seedReactions();
    const older = outboxNote('https://remote.example/notes/older', '2024-01-02T03:04:05.000Z');
    const newer = outboxNote('https://remote.example/notes/newer', '2024-03-04T05:06:07.000Z');
    const boosted = outboxNote('https://remote.example/notes/boosted', '2024-05-06T07:08:09.000Z');
    serveOutbox(
      t,
      [
        createOf(newer),
        new Announce({ id: new URL('https://remote.example/announces/1'), actor: authorOf('alice'), object: boosted }),
        createOf(older),
      ],
      [older, newer, boosted],
    );

    const response = await post(t, t.alice.actorId, t.me.bearer);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ fetched: 2 });
    expect(Number(storedRow(t, older.id!.href)?.createdAt)).toBe(Date.parse('2024-01-02T03:04:05.000Z'));
    expect(Number(storedRow(t, newer.id!.href)?.createdAt)).toBe(Date.parse('2024-03-04T05:06:07.000Z'));
    expect(storedRow(t, boosted.id!.href)).toBeUndefined();
    expect(t.federation.getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
  });

  it('取り込んだ過去の投稿を、投稿日時の順にアカウントの投稿一覧へ出す', async () => {
    const t = await seedReactions();
    const older = outboxNote('https://remote.example/notes/older', '2020-01-02T03:04:05.000Z');
    const newer = outboxNote('https://remote.example/notes/newer', '2020-03-04T05:06:07.000Z');
    serveOutbox(t, [createOf(older), createOf(newer)], [older, newer]);

    await post(t, t.alice.actorId, t.me.bearer);
    const response = await t.request(`/api/v1/accounts/${t.alice.actorId}/statuses`, { headers: t.me.bearer });

    const statuses = await response.json() as { uri: string }[];
    expect(statuses.map((status) => status.uri)).toEqual([newer.id!.href, older.id!.href, t.publicNote.uri]);
  });

  it('トークンがないと 401、write:statuses を満たさないスコープは 403 にする', async () => {
    const t = await seedReactions();

    const responses = await Promise.all([
      post(t, t.alice.actorId, {}),
      post(t, t.alice.actorId, { Authorization: 'Bearer invalid' }),
      post(t, t.alice.actorId, await t.bearerFor('read')),
      post(t, t.alice.actorId, await t.bearerFor('read:statuses')),
      post(t, t.alice.actorId, await t.bearerFor('write:favourites')),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403, 403]);
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });

  it('存在しないアクターと不正な ID は 404 にして取得しない', async () => {
    const t = await seedReactions();

    const responses = await Promise.all([
      post(t, t.seed.uuid(), t.me.bearer),
      post(t, 'not-an-id', t.me.bearer),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
  });
});
