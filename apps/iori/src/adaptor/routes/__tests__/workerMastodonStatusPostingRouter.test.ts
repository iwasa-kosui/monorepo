import { Delete, Endpoints, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const notFound = { error: 'Record not found' };

const setup = async (options: Parameters<typeof setupReadApi>[0] = {}) => {
  const t = setupReadApi(options);
  const me = await t.signIn('write:statuses');
  const alice = t.seed.addLocalActor('alice');
  const json = (body: unknown, headers: Record<string, string> = me.bearer) =>
    t.request('/api/v1/statuses', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const count = (table: string, where = '1=1') =>
    Number((t.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number | bigint }).n);
  const imagesOf = (postId: string) =>
    t.sqlite
      .prepare('SELECT url, altText, createdAt FROM post_images WHERE postId = ? ORDER BY createdAt, imageId')
      .all(postId) as unknown as ReadonlyArray<{ url: string; altText: string | null; createdAt: number }>;
  return { ...t, me, alice, json, count, imagesOf };
};

describe('POST /api/v1/statuses の検証', () => {
  const rejected: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['visibility が public 以外', { status: 'hi', visibility: 'private' }],
    ['spoiler_text が文字列でない', { status: 'hi', spoiler_text: 1 }],
    ['status と spoiler_text の合計が 10001 文字', { status: 'あ'.repeat(5000), spoiler_text: 'い'.repeat(5001) }],
    ['content_type が未対応', { status: 'hi', content_type: 'text/html' }],
    ['status が空白だけで media_ids も空', { status: ' \n\t', media_ids: [] }],
    ['status がなく media_ids も空', {}],
    ['media_ids が形式不正', { status: 'hi', media_ids: ['nope'] }],
    ['media_ids に存在しない media', { status: 'hi', media_ids: [crypto.randomUUID()] }],
  ];

  it.each(rejected)('%s のとき 422 にして投稿を作らない', async (_name, body) => {
    const t = await setup();

    const response = await t.json(body);

    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toMatch(/^Validation failed: /);
    expect(t.count('posts')).toBe(0);
  });

  it('scheduled_at が空でないとき 422 にして投稿を作らない', async () => {
    const t = await setup();

    const response = await t.json({ status: 'hi', scheduled_at: '2099-01-01T00:00:00.000Z' });

    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toMatch(/^Validation failed: /);
    expect(t.count('posts')).toBe(0);
  });

  it('poll[options][] を含むとき 422 にして投稿を作らない', async () => {
    const t = await setup();

    const response = await t.request('/api/v1/statuses', {
      method: 'POST',
      headers: { ...t.me.bearer, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams([
        ['status', 'hi'],
        ['poll[options][]', 'a'],
        ['poll[options][]', 'b'],
        ['poll[expires_in]', '300'],
      ]).toString(),
    });

    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toMatch(/^Validation failed: /);
    expect(t.count('posts')).toBe(0);
  });

  it('status が 10001 文字のとき 422 にして投稿を作らない', async () => {
    const t = await setup();

    const response = await t.json({ status: 'あ'.repeat(10001) });

    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toMatch(/^Validation failed: /);
    expect(t.count('posts')).toBe(0);
  });

  it('status が 10000 文字ちょうどのとき投稿できる', async () => {
    const t = await setup();

    const response = await t.json({ status: 'あ'.repeat(10000) });

    expect(response.status).toBe(200);
    expect(t.count('posts')).toBe(1);
  });

  it('status と spoiler_text の合計が 10000 文字ちょうどのとき投稿できる', async () => {
    const t = await setup();

    const response = await t.json({ status: 'あ'.repeat(5000), spoiler_text: 'い'.repeat(5000) });

    expect(response.status).toBe(200);
    expect(t.count('posts')).toBe(1);
  });

  it('media_ids が5件以上のとき 422 にする', async () => {
    const t = await setup();
    const medias = [];
    for (let i = 0; i < 5; i++) medias.push(await t.addMedia(t.me.userId));

    const response = await t.json({ status: 'hi', media_ids: medias.map((media) => media.mediaId) });

    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toMatch(/^Validation failed: /);
    expect(t.count('posts')).toBe(0);
  });

  it('他人の media を含むとき 422 にする', async () => {
    const t = await setup();
    const mine = await t.addMedia(t.me.userId);
    const theirs = await t.addMedia(t.alice.userId);

    const response = await t.json({ status: 'hi', media_ids: [mine.mediaId, theirs.mediaId] });

    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toMatch(/^Validation failed: /);
    expect(t.count('posts')).toBe(0);
  });

  it('in_reply_to_id の投稿が存在しないとき 404 にする', async () => {
    const t = await setup();

    const response = await t.json({ status: 'hi', in_reply_to_id: crypto.randomUUID() });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(notFound);
    expect(t.count('posts')).toBe(0);
  });

  it('in_reply_to_id の投稿が閲覧者に見えないとき 404 にする', async () => {
    const t = await setup();
    const remote = t.seed.addRemoteActor('bob');
    const hidden = t.seed.addRemotePost(remote, 1_000, { visibility: 'direct', timeline: false });

    const response = await t.json({ status: 'hi', in_reply_to_id: hidden.postId });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(notFound);
    expect(t.count('posts', `postId != '${hidden.postId}'`)).toBe(0);
  });

  it('write:statuses のない Bearer を 403 にする', async () => {
    const t = await setup();

    const response = await t.json({ status: 'hi' }, await t.bearerFor('read'));

    expect(response.status).toBe(403);
    expect(t.count('posts')).toBe(0);
  });
});

describe('POST /api/v1/statuses の iori_destination', () => {
  const setupWithSchedule = async () => {
    const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };
    return { ...(await setup({ scheduleBlueskyCrosspost })), scheduleBlueskyCrosspost };
  };

  it.each([['fediverse', 0], ['both', 1], [undefined, 1], [null, 1]])(
    'iori_destination が %s のとき、投稿して Bluesky への予約を %i 回呼ぶ',
    async (destination, scheduled) => {
      const t = await setupWithSchedule();

      const response = await t.json({ status: 'hi', iori_destination: destination });

      expect(response.status).toBe(200);
      expect(t.count('posts')).toBe(1);
      expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
      expect(t.scheduleBlueskyCrosspost.run).toHaveBeenCalledTimes(scheduled);
    },
  );

  it.each([['fediverse', 0], [undefined, 1]])(
    '返信で iori_destination が %s のとき、投稿して Bluesky への予約を %i 回呼ぶ',
    async (destination, scheduled) => {
      const t = await setupWithSchedule();
      const parent = t.seed.addLocalPost(t.alice, 1_000, { content: '<p>parent</p>' });

      const response = await t.json({ status: 'reply', in_reply_to_id: parent.postId, iori_destination: destination });

      expect(response.status).toBe(200);
      expect(t.count('local_posts', `inReplyToUri IS NOT NULL`)).toBe(1);
      expect(t.scheduleBlueskyCrosspost.run).toHaveBeenCalledTimes(scheduled);
    },
  );

  it.each([['bluesky'], ['unknown'], [''], [1], [true]])(
    'iori_destination が %s のとき 422 にして投稿を作らない',
    async (destination) => {
      const t = await setup();

      const response = await t.json({ status: 'hi', iori_destination: destination });

      expect(response.status).toBe(422);
      expect(((await response.json()) as { error: string }).error).toMatch(/^Validation failed: /);
      expect(t.count('posts')).toBe(0);
    },
  );
});

describe('POST /api/v1/statuses', () => {
  it('text/plain の本文を HTML にして投稿し、language と Idempotency-Key は無視する', async () => {
    const t = await setup();

    const response = await t.json({
      status: 'hello <b>\nsee https://example.com/a.',
      language: 'ja',
      visibility: 'public',
      sensitive: false,
      spoiler_text: '',
    }, { ...t.me.bearer, 'Idempotency-Key': 'abc' });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(status).toMatchObject({
      content: '<p>hello &lt;b&gt;<br />see <a href="https://example.com/a">https://example.com/a</a>.</p>',
      in_reply_to_id: null,
      media_attachments: [],
      account: { username: 'kosui' },
    });
    expect(t.count('posts', `postId='${status.id}' AND actorId='${t.me.actorId}'`)).toBe(1);
    expect(t.count('timeline_items', `postId='${status.id}'`)).toBe(1);
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
  });

  describe('spoiler_text と sensitive', () => {
    const storedOf = (t: Awaited<ReturnType<typeof setup>>, postId: string) =>
      t.sqlite.prepare('SELECT summary, sensitive FROM posts WHERE postId = ?').get(postId) as {
        summary: string | null;
        sensitive: number | bigint;
      };

    it('spoiler_text を summary に保存し、sensitive を真にして返す', async () => {
      const t = await setup();

      const response = await t.json({ status: 'hi', spoiler_text: 'cw' });

      expect(response.status).toBe(200);
      const status = StatusSchema.parse(await response.json());
      expect(status).toMatchObject({ spoiler_text: 'cw', sensitive: true });
      const stored = storedOf(t, status.id);
      expect(stored.summary).toBe('cw');
      expect(Number(stored.sensitive)).toBe(1);
    });

    it('spoiler_text が空白だけのとき summary を null にし、sensitive を偽にする', async () => {
      const t = await setup();

      const response = await t.json({ status: 'hi', spoiler_text: '  ' });

      expect(response.status).toBe(200);
      const status = StatusSchema.parse(await response.json());
      expect(status).toMatchObject({ spoiler_text: '', sensitive: false });
      const stored = storedOf(t, status.id);
      expect(stored.summary).toBeNull();
      expect(Number(stored.sensitive)).toBe(0);
    });

    it('sensitive だけが真のとき summary を null にして sensitive を真にする', async () => {
      const t = await setup();

      const response = await t.json({ status: 'hi', sensitive: true });

      expect(response.status).toBe(200);
      const status = StatusSchema.parse(await response.json());
      expect(status).toMatchObject({ spoiler_text: '', sensitive: true });
      const stored = storedOf(t, status.id);
      expect(stored.summary).toBeNull();
      expect(Number(stored.sensitive)).toBe(1);
    });

    it('sensitive が文字列の true のとき sensitive を真にする', async () => {
      const t = await setup();

      const response = await t.json({ status: 'hi', sensitive: 'true' });

      expect(response.status).toBe(200);
      const status = StatusSchema.parse(await response.json());
      expect(status.sensitive).toBe(true);
      expect(Number(storedOf(t, status.id).sensitive)).toBe(1);
    });

    it('返信でも spoiler_text を保存する', async () => {
      const t = await setup();
      const parent = t.seed.addLocalPost(t.alice, 1_000, { content: '<p>parent</p>' });

      const response = await t.json({ status: 'reply', spoiler_text: 'cw', in_reply_to_id: parent.postId });

      expect(response.status).toBe(200);
      const status = StatusSchema.parse(await response.json());
      expect(status).toMatchObject({ in_reply_to_id: parent.postId, spoiler_text: 'cw', sensitive: true });
      const stored = storedOf(t, status.id);
      expect(stored.summary).toBe('cw');
      expect(Number(stored.sensitive)).toBe(1);
    });
  });

  it('text/markdown の本文を Markdown として HTML にする', async () => {
    const t = await setup();

    const response = await t.json({ status: 'a **bold** word', content_type: 'text/markdown' });

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json()).content).toContain('<strong>bold</strong>');
  });

  it('text/markdown の本文に含まれる script、イベント属性、javascript: のリンク、iframe を保存前に取り除く', async () => {
    const t = await setup();

    const response = await t.json({
      status: '<script>alert(1)</script>\n\n<p onclick="alert(2)">hi</p>\n\n[x](javascript:alert(3))\n\n'
        + '<iframe src="https://evil.example"></iframe>\n\n**ok**',
      content_type: 'text/markdown',
    });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    const stored = t.sqlite.prepare('SELECT content FROM posts WHERE postId = ?').get(status.id) as {
      content: string;
    };
    expect(stored.content).not.toMatch(/<script|<iframe|onclick|javascript:/i);
    expect(stored.content).toContain('<p>hi</p>');
    expect(stored.content).toContain('<strong>ok</strong>');
  });

  it('画像の順序と説明を保って保存し、レスポンスでも同じ順序で返す', async () => {
    const t = await setup();
    const first = await t.addMedia(t.me.userId, 'first');
    const second = await t.addMedia(t.me.userId, null);
    const third = await t.addMedia(t.me.userId, 'third');

    const response = await t.request('/api/v1/statuses', {
      method: 'POST',
      headers: { ...t.me.bearer, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: [third, first, second].map((media) => `media_ids[]=${media.mediaId}`).join('&') + '&status=pics',
    });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(status.media_attachments.map((media) => [media.url, media.description])).toEqual([
      [third.url, 'third'],
      [first.url, 'first'],
      [second.url, null],
    ]);
    const stored = t.imagesOf(status.id);
    expect(stored.map((image) => [image.url, image.altText])).toEqual([
      [third.url, 'third'],
      [first.url, 'first'],
      [second.url, null],
    ]);
    expect(stored[1]!.createdAt - stored[0]!.createdAt).toBe(1);
    expect(stored[2]!.createdAt - stored[1]!.createdAt).toBe(1);
  });

  it('status が空でも media_ids があれば投稿できる', async () => {
    const t = await setup();
    const media = await t.addMedia(t.me.userId, 'only');
    const body = new FormData();
    body.set('media_ids', media.mediaId);

    const response = await t.request('/api/v1/statuses', { method: 'POST', headers: t.me.bearer, body });

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      content: '',
      media_attachments: [{ url: media.url, description: 'only' }],
    });
  });

  it('返信として投稿し、返信先の投稿の in_reply_to_id を持つ Status を返す', async () => {
    const t = await setup();
    const parent = t.seed.addLocalPost(t.alice, 1_000, { content: '<p>parent</p>' });

    const response = await t.json({ status: 'reply', in_reply_to_id: parent.postId });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(status).toMatchObject({
      content: '<p>reply</p>',
      in_reply_to_id: parent.postId,
      in_reply_to_account_id: t.alice.actorId,
    });
    expect(t.count('local_posts', `postId='${status.id}' AND inReplyToUri IS NOT NULL`)).toBe(1);
    expect(t.count('notifications', `recipientUserId='${t.alice.userId}'`)).toBe(1);
  });

  it('Cookie のセッションでも投稿できる', async () => {
    const t = await setup();

    const response = await t.json({ status: 'from the web' }, {
      Cookie: `sessionId=${t.me.sessionId}`,
      Origin: ORIGIN,
    });

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json()).content).toBe('<p>from the web</p>');
    expect(t.count('posts', `actorId='${t.me.actorId}'`)).toBe(1);
  });
});

describe('POST /api/v1/statuses のメンション', () => {
  const aliceId = 'https://remote.example/users/alice';
  const mentionLink =
    `<span class="h-card"><a href="${aliceId}" class="u-url mention">@<span>alice@remote.example</span></a></span>`;

  const withRemoteAlice = async () => {
    const t = await setup();
    t.remoteActorLookup.lookup.mockImplementation(
      (({ handle }: { handle: string }) =>
        handle === '@alice@remote.example'
          ? RA.ok(
            new Person({
              id: new URL(aliceId),
              inbox: new URL(`${aliceId}/inbox`),
              endpoints: new Endpoints({ sharedInbox: new URL('https://remote.example/inbox') }),
            }),
          )
          : RA.err({
            type: 'RemoteActorLookupError',
            message: 'not found',
            detail: { handle, reason: 'not found' },
          })) as never,
    );
    const storedContent = (postId: string) =>
      (t.sqlite.prepare('SELECT content FROM posts WHERE postId = ?').get(postId) as { content: string }).content;
    return { ...t, storedContent };
  };

  it('text/plain の本文の @user@host を解決し、リンクにして mentions として渡す', async () => {
    const t = await withRemoteAlice();

    const response = await t.json({ status: 'hi @alice@remote.example' });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(status.content).toContain(`href="${aliceId}"`);
    expect(status.content).toContain('class="u-url mention"');
    expect(t.storedContent(status.id)).toBe(`<p>hi ${mentionLink}</p>`);
    expect(t.remoteActorLookup.lookup).toHaveBeenCalledTimes(1);
    expect((t.remoteActorLookup.lookup.mock.calls[0] as unknown[] | undefined)?.[0]).toMatchObject({
      handle: '@alice@remote.example',
      identifier: 'kosui',
    });
    const sent = t.federation.sendActivity.mock.calls.map((call) => call as unknown[]);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.[1]).toBe('followers');
    expect(sent[1]?.[1]).toEqual([{
      id: new URL(aliceId),
      inboxId: new URL(`${aliceId}/inbox`),
      endpoints: { sharedInbox: new URL('https://remote.example/inbox') },
    }]);
  });

  it('text/markdown の本文の @user@host もリンクにして mentions として渡す', async () => {
    const t = await withRemoteAlice();

    const response = await t.json({
      status: '**@alice@remote.example** `@bob@nowhere.example`',
      content_type: 'text/markdown',
    });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(t.storedContent(status.id)).toContain(`<strong>${mentionLink}</strong>`);
    expect(t.storedContent(status.id)).toContain('<code>@bob@nowhere.example</code>');
    expect(t.remoteActorLookup.lookup).toHaveBeenCalledTimes(1);
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(2);
  });

  it('解決できない acct は平文のまま 200 で投稿し、mentions には含めない', async () => {
    const t = await withRemoteAlice();

    const response = await t.json({ status: 'hi @bob@nowhere.example' });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(t.storedContent(status.id)).toBe('<p>hi @bob@nowhere.example</p>');
    expect(t.remoteActorLookup.lookup).toHaveBeenCalledTimes(1);
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
  });

  it('lookup が例外を投げても 200 で投稿する', async () => {
    const t = await withRemoteAlice();
    t.remoteActorLookup.lookup.mockImplementation(
      (() => {
        throw new Error('network down');
      }) as never,
    );

    const response = await t.json({ status: 'hi @alice@remote.example' });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(t.storedContent(status.id)).toBe('<p>hi @alice@remote.example</p>');
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
  });

  it('lookup が 5 秒で返らなければ未解決として 200 で投稿する', async () => {
    const t = await withRemoteAlice();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const lookupStarted = Promise.withResolvers<void>();
      t.remoteActorLookup.lookup.mockImplementation(
        (() => {
          lookupStarted.resolve();
          return new Promise(() => {});
        }) as never,
      );

      const responsePromise = t.json({ status: 'hi @alice@remote.example' });
      await lookupStarted.promise;
      await vi.advanceTimersByTimeAsync(5000);
      const response = await responsePromise;

      expect(response.status).toBe(200);
      const status = StatusSchema.parse(await response.json());
      expect(t.storedContent(status.id)).toBe('<p>hi @alice@remote.example</p>');
      expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('自分のホストの acct は lookup せず、平文のまま mentions にも含めない', async () => {
    const t = await withRemoteAlice();

    const response = await t.json({ status: 'hi @kosui@iori.test and @Kosui@IORI.test' });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(t.remoteActorLookup.lookup).not.toHaveBeenCalled();
    expect(t.storedContent(status.id)).toBe('<p>hi @kosui@iori.test and @Kosui@IORI.test</p>');
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
  });

  it('同じ相手を大文字小文字違いで書いても lookup は 1 回だけにする', async () => {
    const t = await withRemoteAlice();

    const response = await t.json({ status: '@alice@remote.example @Alice@Remote.Example' });

    expect(response.status).toBe(200);
    expect(t.remoteActorLookup.lookup).toHaveBeenCalledTimes(1);
  });

  it('@user@host の無い本文は lookup を呼ばない', async () => {
    const t = await withRemoteAlice();

    const response = await t.json({ status: 'hello foo@bar.example' });

    expect(response.status).toBe(200);
    expect(t.remoteActorLookup.lookup).not.toHaveBeenCalled();
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(1);
  });

  it('返信でも @user@host を解決して mentions に渡す', async () => {
    const t = await withRemoteAlice();
    const parent = t.seed.addLocalPost(t.alice, 1_000, { content: '<p>parent</p>' });

    const response = await t.json({ status: '@alice@remote.example reply', in_reply_to_id: parent.postId });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(t.storedContent(status.id)).toBe(`<p>${mentionLink} reply</p>`);
    expect(t.federation.sendActivity).toHaveBeenCalledTimes(2);
  });
});

describe('DELETE /api/v1/statuses/:id', () => {
  const remove = (t: Awaited<ReturnType<typeof setup>>, id: string) =>
    t.request(`/api/v1/statuses/${id}`, { method: 'DELETE', headers: t.me.bearer });

  it('自分の投稿を削除し、削除前の Status に text を足して返す', async () => {
    const t = await setup();
    const own = t.seed.addLocalPost(t.me, 1_000, { content: '<p>Hello <b>world</b></p><p>second</p>' });

    const response = await remove(t, own.postId);

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(StatusSchema.parse(body)).toMatchObject({
      id: own.postId,
      content: '<p>Hello <b>world</b></p><p>second</p>',
      text: 'Hello world\nsecond',
    });
    expect(t.count('posts', `postId='${own.postId}'`)).toBe(0);
    const sent = t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(Delete);
    const afterwards = await t.request(`/api/v1/statuses/${own.postId}`, { headers: await t.bearerFor('read') });
    expect(afterwards.status).toBe(404);
  });

  it('存在しない、他人の、リモートの投稿は 404 にして削除しない', async () => {
    const t = await setup();
    const theirs = t.seed.addLocalPost(t.alice, 1_000);
    const remote = t.seed.addRemotePost(t.seed.addRemoteActor('bob'), 2_000, { visibility: 'public' });

    const responses = await Promise.all([
      remove(t, crypto.randomUUID()),
      remove(t, 'nope'),
      remove(t, theirs.postId),
      remove(t, remote.postId),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(notFound);
    }
    expect(t.count('posts', `postId IN ('${theirs.postId}', '${remote.postId}')`)).toBe(2);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });
});
