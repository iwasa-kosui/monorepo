import type { Note } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { FediverseConversationKey } from '../../../domain/fediverseConversation/conversationKey.ts';
import { StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const BASE_PATH = '/api/iori/v1/fediverse/conversations';
const NOW = Date.UTC(2026, 10, 12, 12);
const meUri = `${ORIGIN}/users/kosui`;
const aliceUri = 'https://remote.example/users/alice';
const bobUri = 'https://other.example/users/bob';
const keyOf = (...uris: string[]) => {
  const key = FediverseConversationKey.encode(uris);
  if (!key.ok) throw new Error('unreachable');
  return key.val;
};
const aliceKey = keyOf(aliceUri);
const groupKey = keyOf(aliceUri, bobUri);

const setup = async (scope = 'read:statuses write:statuses') => {
  const t = setupReadApi();
  const me = await t.signIn(scope);
  const alice = t.seed.addRemoteActor('alice');
  const bob = t.seed.addRemoteActor('bob', 'other.example');
  const hanako = t.seed.addLocalActor('hanako');
  const participate = (postId: string, uris: ReadonlyArray<string>) => {
    for (const uri of uris) {
      t.sqlite.prepare('INSERT INTO direct_post_participants(postId,actorUri) VALUES (?,?)').run(postId, uri);
    }
  };
  const fromRemote = (
    author: { actorId: string },
    createdAt: number,
    participants: ReadonlyArray<string>,
    options: { content?: string; recipients?: ReadonlyArray<string> } = {},
  ) => {
    const post = t.seed.addRemotePost(author, createdAt, {
      visibility: 'direct',
      timeline: false,
      content: options.content ?? `<p>from ${createdAt}</p>`,
      recipientActorUris: options.recipients ?? participants,
    });
    participate(post.postId, participants);
    return post;
  };
  const fromMe = (createdAt: number, participants: ReadonlyArray<string>, content = `<p>mine ${createdAt}</p>`) => {
    const post = t.seed.addLocalPost(me, createdAt, { visibility: 'direct', timeline: false, content });
    participate(post.postId, participants);
    return post;
  };
  const get = (path: string, headers: Record<string, string> = me.bearer) =>
    t.request(`${BASE_PATH}${path}`, { headers });
  const post = (path: string, body?: unknown, headers: Record<string, string> = me.bearer) =>
    t.request(`${BASE_PATH}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const count = (table: string, where = '1=1') =>
    Number((t.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number | bigint }).n);
  const sent = () => t.federation.sendActivity.mock.calls.map((call) => call as unknown[]);
  return { ...t, me, alice, bob, hanako, fromRemote, fromMe, get, post, count, sent };
};

type Setup = Awaited<ReturnType<typeof setup>>;

describe('GET /conversations', () => {
  it('閲覧者が参加する direct の投稿を、相手の組ごとにまとめて、最後のメッセージの新しい順に返す', async () => {
    const t = await setup();
    t.fromRemote(t.alice, NOW - 5000, [aliceUri, meUri], { content: '<p>hello <b>there</b></p>' });
    t.fromMe(NOW - 4000, [meUri, aliceUri], '<p>mine</p>');
    t.fromRemote(t.bob, NOW - 3000, [bobUri, aliceUri, meUri], { content: '<p>group</p>' });
    t.fromRemote(t.alice, NOW - 2000, [aliceUri, meUri], { content: '<p>latest &amp; greatest</p>' });

    const response = await t.get('');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversations: [
        {
          key: aliceKey,
          peers: [{
            accountId: t.alice.actorId,
            actorUri: aliceUri,
            acct: 'alice@remote.example',
            displayName: 'alice',
            avatar: `${ORIGIN}/default-avatar.png`,
            path: `/remote-users/${t.alice.actorId}`,
          }],
          lastMessage: { text: 'latest & greatest', sentAt: NOW - 2000, own: false },
          unreadCount: 0,
        },
        {
          key: groupKey,
          peers: [
            expect.objectContaining({ actorUri: bobUri, acct: 'bob@other.example' }),
            expect.objectContaining({ actorUri: aliceUri }),
          ],
          lastMessage: { text: 'group', sentAt: NOW - 3000, own: false },
          unreadCount: 0,
        },
      ],
      cursor: null,
    });
  });

  it('読んだ投稿が上限に達したときだけ cursor を返し、続きは cursor より古い投稿から読む', async () => {
    const t = await setup();
    t.fromRemote(t.alice, NOW - 1_000_000, [aliceUri, meUri]);
    for (let i = 0; i < 200; i++) t.fromRemote(t.bob, NOW - i, [bobUri, meUri]);

    const first = await (await t.get('')).json() as { conversations: { key: string }[]; cursor: string | null };
    expect(first.conversations.map(({ key }) => key)).toEqual([keyOf(bobUri)]);
    expect(first.cursor).not.toBeNull();

    const second = await (await t.get(`?cursor=${encodeURIComponent(first.cursor!)}`)).json() as {
      conversations: { key: string }[];
      cursor: string | null;
    };
    expect(second.conversations.map(({ key }) => key)).toEqual([aliceKey]);
    expect(second.cursor).toBeNull();
  });

  it('壊れた cursor を 400 にする', async () => {
    const t = await setup();

    const response = await t.get('?cursor=nope');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Validation failed: cursor' });
  });

  it('actors に無い相手でも、URI から作った acct で会話を返す', async () => {
    const t = await setup();
    const unknown = 'https://ghost.example/users/ghost';
    t.fromRemote(t.alice, NOW, [aliceUri, unknown, meUri]);

    const body = await (await t.get('')).json() as { conversations: { peers: unknown[] }[] };

    expect(body.conversations[0]?.peers[0]).toEqual({
      accountId: null,
      actorUri: unknown,
      acct: 'ghost@ghost.example',
      displayName: 'ghost@ghost.example',
      avatar: `${ORIGIN}/default-avatar.png`,
      path: null,
    });
  });
});

describe('GET /conversations/:key', () => {
  it('相手、最後のメッセージ、未読数を返す', async () => {
    const t = await setup();
    const post = t.fromRemote(t.alice, NOW - 1000, [aliceUri, meUri], { content: '<p>hi</p>' });
    t.seed.addMentionNotification(t.me.userId, t.alice.actorId, post.postId, NOW - 1000);

    const response = await t.get(`/${aliceKey}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversation: {
        key: aliceKey,
        peers: [expect.objectContaining({ actorUri: aliceUri, accountId: t.alice.actorId })],
        lastMessage: { text: 'hi', sentAt: NOW - 1000, own: false },
        unreadCount: 1,
      },
      viewerAccountId: t.me.actorId,
    });
  });
});

describe('会話のキー', () => {
  it('解釈できないキーを 400 にする', async () => {
    const t = await setup();
    const key = 'not base64!';

    for (const response of [await t.get(`/${key}`), await t.get(`/${key}/messages`)]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Validation failed: key' });
    }
    expect((await t.post(`/${key}/messages`, { text: 'hi' })).status).toBe(400);
    expect((await t.post(`/${key}/read`, {})).status).toBe(400);
  });

  it('自分自身が相手に入っているキーを 400 にする', async () => {
    const t = await setup();

    expect((await t.get(`/${keyOf(meUri)}`)).status).toBe(400);
  });
});

describe('GET /conversations/:key/messages', () => {
  it('参加者の組がちょうど一致する投稿を、古い順の Status で返す', async () => {
    const t = await setup();
    const first = t.fromRemote(t.alice, NOW - 4000, [aliceUri, meUri], { content: '<p>one</p>' });
    const second = t.fromMe(NOW - 3000, [meUri, aliceUri], '<p>two</p>');
    t.fromRemote(t.bob, NOW - 2500, [bobUri, aliceUri, meUri]);
    const third = t.fromRemote(t.alice, NOW - 2000, [aliceUri, meUri], { content: '<p>three</p>' });
    t.fromRemote(t.alice, NOW - 1500, [aliceUri, bobUri]);
    t.seed.addRemotePost(t.alice, NOW - 1000, { visibility: 'public', recipientActorUris: [meUri] });

    const response = await t.get(`/${aliceKey}/messages`);

    expect(response.status).toBe(200);
    const body = await response.json() as { messages: unknown[]; cursor: string | null; order: string };
    expect(body.order).toBe('oldest_first');
    expect(body.cursor).toBeNull();
    const messages = body.messages.map((message) => StatusSchema.parse(message));
    expect(messages.map((message) => message.id)).toEqual([first.postId, second.postId, third.postId]);
    expect(messages.map((message) => message.visibility)).toEqual(['direct', 'direct', 'direct']);
    expect(messages[0]?.content).toBe('<p>one</p>');
    expect(messages.map((message) => message.account.id)).toEqual([t.alice.actorId, t.me.actorId, t.alice.actorId]);
  });

  it('30 件ずつ新しい側から返し、cursor で古い側へ続く', async () => {
    const t = await setup();
    const ids = Array.from(
      { length: 35 },
      (_, i) => t.fromRemote(t.alice, NOW - 100_000 + i, [aliceUri, meUri]).postId,
    );

    const first = await (await t.get(`/${aliceKey}/messages`)).json() as {
      messages: { id: string }[];
      cursor: string | null;
    };
    expect(first.messages.map((message) => message.id)).toEqual(ids.slice(5));
    expect(first.cursor).not.toBeNull();

    const second = await (await t.get(`/${aliceKey}/messages?cursor=${encodeURIComponent(first.cursor!)}`)).json() as {
      messages: { id: string }[];
      cursor: string | null;
    };
    expect(second.messages.map((message) => message.id)).toEqual(ids.slice(0, 5));
    expect(second.cursor).toBeNull();
  });
});

describe('POST /conversations/:key/messages', () => {
  it('相手へのメンションを先頭に付けた direct で投稿し、followers には送らず相手の inbox にだけ送る', async () => {
    const t = await setup();

    const response = await t.post(`/${aliceKey}/messages`, { text: '  hello\nworld  ' });

    expect(response.status).toBe(201);
    const { message } = await response.json() as { message: unknown };
    const status = StatusSchema.parse(message);
    expect(status.visibility).toBe('direct');
    expect(status.in_reply_to_id).toBeNull();
    expect(status.account.id).toBe(t.me.actorId);
    expect(status.content).toBe(
      `<p><span class="h-card"><a href="${aliceUri}" class="u-url mention">@<span>alice@remote.example</span></a></span> hello<br />world</p>`,
    );
    expect(t.count('local_posts', `postId='${status.id}' AND visibility='direct'`)).toBe(1);
    const participants = t.sqlite.prepare('SELECT actorUri FROM direct_post_participants WHERE postId = ?')
      .all(status.id) as { actorUri: string }[];
    expect(participants.map((row) => row.actorUri).sort()).toEqual([aliceUri, meUri].sort());
    expect(t.sent()).toHaveLength(1);
    expect(t.sent()[0]?.[1]).toEqual([
      expect.objectContaining({ id: new URL(aliceUri), inboxId: new URL(`${aliceUri}/inbox`) }),
    ]);
    expect(t.sent().map((call) => call[1])).not.toContain('followers');
  });

  it('複数の相手には全員へのメンションを付ける', async () => {
    const t = await setup();

    const response = await t.post(`/${groupKey}/messages`, { text: 'hi' });

    const status = StatusSchema.parse(((await response.json()) as { message: unknown }).message);
    expect(status.content).toContain(`href="${aliceUri}"`);
    expect(status.content).toContain(`href="${bobUri}"`);
    const participants = t.sqlite.prepare('SELECT actorUri FROM direct_post_participants WHERE postId = ?')
      .all(status.id) as { actorUri: string }[];
    expect(participants.map((row) => row.actorUri).sort()).toEqual([aliceUri, bobUri, meUri].sort());
    expect(t.sent()[0]?.[1]).toHaveLength(2);
  });

  it('本文の中の別のアカウント名は、メンションにも参加者にもしない', async () => {
    const t = await setup();

    const response = await t.post(`/${aliceKey}/messages`, { text: 'cc @bob@other.example' });

    const status = StatusSchema.parse(((await response.json()) as { message: unknown }).message);
    expect(status.content).not.toContain(bobUri);
    const participants = t.sqlite.prepare('SELECT actorUri FROM direct_post_participants WHERE postId = ?')
      .all(status.id) as { actorUri: string }[];
    expect(participants.map((row) => row.actorUri).sort()).toEqual([aliceUri, meUri].sort());
  });

  it('会話の最新の投稿が自分のものなら、それへの返信にする', async () => {
    const t = await setup();
    const latest = t.fromMe(NOW - 1000, [meUri, aliceUri]);

    const response = await t.post(`/${aliceKey}/messages`, { text: 'again' });

    expect(response.status).toBe(201);
    const status = StatusSchema.parse(((await response.json()) as { message: unknown }).message);
    expect(status.in_reply_to_id).toBe(latest.postId);
    expect(status.visibility).toBe('direct');
    expect(t.sent().map((call) => call[1])).not.toContain('followers');
  });

  it('会話の最新の投稿が相手のものなら、相手のサーバーに問い合わせず、保存済みの情報で返信にして相手に送る', async () => {
    const t = await setup();
    const latest = t.fromRemote(t.alice, NOW - 1000, [aliceUri, meUri]);

    const response = await t.post(`/${aliceKey}/messages`, { text: 'reply' });

    expect(response.status).toBe(201);
    const status = StatusSchema.parse(((await response.json()) as { message: unknown }).message);
    expect(status.in_reply_to_id).toBe(latest.postId);
    expect(t.federation.lookupObject).not.toHaveBeenCalled();
    expect(t.sent().map((call) => call[1])).not.toContain('followers');
    expect(t.sent()).toHaveLength(1);
    expect(t.sent()[0]?.[1]).toEqual(
      expect.objectContaining({ id: new URL(aliceUri), inboxId: new URL(`${aliceUri}/inbox`) }),
    );
    const create = t.sent()[0]?.[2] as { getObject: () => Promise<Note> };
    const note = await create.getObject();
    expect(note.replyTargetId?.href).toBe(latest.uri);
  });

  it('相手のサーバーのノートを引けないときは 502 にし、投稿を保存せず、何も送らない', async () => {
    const t = await setup();
    const carol = t.seed.addRemoteActor('carol');
    t.sqlite.prepare('UPDATE actors SET inboxUrl = ? WHERE actorId = ?').run('', carol.actorId);
    t.fromRemote(carol, NOW - 1000, [aliceUri, meUri]);
    const before = t.count('posts');

    const response = await t.post(`/${aliceKey}/messages`, { text: 'reply' });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'The remote server could not be reached' });
    expect(t.count('posts')).toBe(before);
    expect(t.sent()).toHaveLength(0);
  });

  it.each([
    ['text が無い', {}],
    ['text が空白だけ', { text: ' \n\t ' }],
  ])('%s とき 422 の empty にして投稿を作らない', async (_name, body) => {
    const t = await setup();

    const response = await t.post(`/${aliceKey}/messages`, body);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: text', reason: 'empty' });
    expect(t.count('posts')).toBe(0);
    expect(t.sent()).toHaveLength(0);
  });

  it('10000 文字を超える本文を 422 の too_long にし、ちょうど 10000 文字は受け付ける', async () => {
    const t = await setup();

    const tooLong = await t.post(`/${aliceKey}/messages`, { text: 'あ'.repeat(10001) });
    const exact = await t.post(`/${aliceKey}/messages`, { text: 'あ'.repeat(10000) });

    expect(tooLong.status).toBe(422);
    expect(await tooLong.json()).toEqual({ error: 'Validation failed: text', reason: 'too_long' });
    expect(exact.status).toBe(201);
    expect(t.count('posts')).toBe(1);
  });

  it.each([
    ['actors に無い相手', 'https://ghost.example/users/ghost'],
    ['このサーバーのユーザー', `${ORIGIN}/users/hanako`],
  ])('%s には送れず 422 にして投稿を作らない', async (_name, uri) => {
    const t = await setup();

    const response = await t.post(`/${keyOf(uri)}/messages`, { text: 'hi' });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: peers' });
    expect(t.count('posts')).toBe(0);
    expect(t.sent()).toHaveLength(0);
  });
});

describe('POST /conversations/:key/read', () => {
  it('その会話の投稿の未読の通知だけを既読にする', async () => {
    const t = await setup();
    const mine = t.fromMe(NOW - 5000, [meUri, aliceUri]);
    const mention = t.fromRemote(t.alice, NOW - 4000, [aliceUri, meUri]);
    const reply = t.fromRemote(t.alice, NOW - 3000, [aliceUri, meUri]);
    const other = t.fromRemote(t.bob, NOW - 2000, [bobUri, meUri]);
    t.seed.addMentionNotification(t.me.userId, t.alice.actorId, mention.postId, NOW - 4000);
    t.seed.addReplyNotification(t.me.userId, t.alice.actorId, reply.postId, mine.postId, NOW - 3000);
    t.seed.addMentionNotification(t.me.userId, t.bob.actorId, other.postId, NOW - 2000);

    const response = await t.post(`/${aliceKey}/read`, {});

    expect(response.status).toBe(204);
    expect(t.count('notifications', 'isRead = 1')).toBe(2);
    expect(await (await t.get('/unread_count')).json()).toEqual({ unread: 1 });
    expect(
      ((await (await t.get(`/${aliceKey}`)).json()) as { conversation: { unreadCount: number } }).conversation
        .unreadCount,
    ).toBe(0);
  });
});

describe('GET /conversations/unread_count', () => {
  it('未読のメッセージの数を返し、既読の通知と他の利用者宛の通知は数えない', async () => {
    const t = await setup();
    const a1 = t.fromRemote(t.alice, NOW - 4000, [aliceUri, meUri]);
    const a2 = t.fromRemote(t.alice, NOW - 3000, [aliceUri, meUri]);
    const b = t.fromRemote(t.bob, NOW - 2000, [bobUri, meUri]);
    const g = t.fromRemote(t.bob, NOW - 1000, [bobUri, aliceUri, meUri]);
    t.seed.addMentionNotification(t.me.userId, t.alice.actorId, a1.postId, NOW - 4000);
    t.seed.addMentionNotification(t.me.userId, t.alice.actorId, a2.postId, NOW - 3000);
    const read = t.seed.addMentionNotification(t.me.userId, t.bob.actorId, b.postId, NOW - 2000);
    t.sqlite.prepare('UPDATE notifications SET isRead = 1 WHERE notificationId = ?').run(read);
    t.seed.addMentionNotification(t.hanako.userId, t.bob.actorId, g.postId, NOW - 1000);

    expect(await (await t.get('/unread_count')).json()).toEqual({ unread: 2 });
  });
});

describe('POST /conversations', () => {
  it('actors に存在する相手の key を返す', async () => {
    const t = await setup();

    const response = await t.post('', { actorUri: aliceUri });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ key: aliceKey });
  });

  it('actors に存在しない相手を 404 にする', async () => {
    const t = await setup();

    const response = await t.post('', { actorUri: 'https://ghost.example/users/ghost' });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Record not found' });
  });

  it.each([['actorUri が無い', {}], ['URL でない', { actorUri: 'alice' }], ['数値', { actorUri: 1 }]])(
    '%s とき 400 にする',
    async (_name, body) => {
      const t = await setup();

      const response = await t.post('', body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Validation failed: actorUri' });
    },
  );

  it('自分自身を 422 にする', async () => {
    const t = await setup();

    expect((await t.post('', { actorUri: meUri })).status).toBe(422);
  });
});

describe('認可と応答ヘッダー', () => {
  type Route = Readonly<{ name: string; method: 'GET' | 'POST'; path: string; scope: string; body?: unknown }>;
  const routes: readonly Route[] = [
    { name: '会話一覧', method: 'GET', path: '', scope: 'read:statuses' },
    { name: '未読数', method: 'GET', path: '/unread_count', scope: 'read:statuses' },
    { name: '会話 1 件', method: 'GET', path: `/${aliceKey}`, scope: 'read:statuses' },
    { name: 'メッセージ一覧', method: 'GET', path: `/${aliceKey}/messages`, scope: 'read:statuses' },
    { name: '送信', method: 'POST', path: `/${aliceKey}/messages`, scope: 'write:statuses', body: { text: 'hi' } },
    { name: '既読化', method: 'POST', path: `/${aliceKey}/read`, scope: 'write:statuses', body: {} },
    { name: '会話を開く', method: 'POST', path: '', scope: 'write:statuses', body: { actorUri: aliceUri } },
  ];
  const call = (t: Setup, route: Route, headers: Record<string, string>) =>
    route.method === 'GET' ? t.get(route.path, headers) : t.post(route.path, route.body, headers);

  it.each(routes)('$name（$method）は所有者でない利用者を 403 にして、何も変更しない', async (route) => {
    const t = await setup('read:search');
    const issued = await t.issueUserToken(`${route.scope}`);
    t.seed.addLocalActor('someone', issued.userId);

    const response = await call(t, route, { Authorization: `Bearer ${issued.token}` });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.count('posts')).toBe(0);
    expect(t.sent()).toHaveLength(0);
  });

  describe.each([routes[0]!, routes[4]!])('$name（$method）', (route) => {
    it('認証なしを 401 にし、scope を満たさないトークンを 403 にして、何も変更しない', async () => {
      const t = await setup('read:search');

      expect((await call(t, route, { Origin: ORIGIN })).status).toBe(401);
      expect((await call(t, route, t.me.bearer)).status).toBe(403);
      expect(t.count('posts')).toBe(0);
      expect(t.sent()).toHaveLength(0);
    });

    it('成功とエラーのどの応答にも Cache-Control: private, no-store を付ける', async () => {
      const t = await setup();
      const noStore = 'private, no-store';

      const ok = await call(t, route, t.me.bearer);
      const unauthorized = await call(t, route, { Origin: ORIGIN });
      const invalidKey = route.path.includes('/') && route.path !== '/unread_count'
        ? await t.request(`${BASE_PATH}${route.path.replace(aliceKey, 'bad key')}`, {
          method: route.method,
          headers: { ...t.me.bearer, 'Content-Type': 'application/json' },
          body: route.method === 'POST' ? JSON.stringify(route.body) : undefined,
        })
        : undefined;

      expect(ok.headers.get('Cache-Control')).toBe(noStore);
      expect(unauthorized.headers.get('Cache-Control')).toBe(noStore);
      if (invalidKey !== undefined) expect(invalidKey.headers.get('Cache-Control')).toBe(noStore);
    });
  });
});
