import { Endpoints, Note, Person, Update } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import type { PostVersion } from '../../../domain/post/post.ts';
import { StatusEditSchema, StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const notFound = { error: 'Record not found' };

const setup = async (options: Parameters<typeof setupReadApi>[0] = {}) => {
  const t = setupReadApi(options);
  const me = await t.signIn('read write:statuses');
  const alice = t.seed.addLocalActor('alice');
  const send = (method: 'POST' | 'PUT', path: string, body: unknown) =>
    t.request(path, {
      method,
      headers: { ...me.bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const post = (body: unknown) => send('POST', '/api/v1/statuses', body);
  const edit = (id: string, body: unknown) => send('PUT', `/api/v1/statuses/${id}`, body);
  const source = (id: string) => t.request(`/api/v1/statuses/${id}/source`, { headers: me.bearer });
  const rowOf = (postId: string) =>
    t.sqlite.prepare(
      `SELECT p.content, p.summary, p.sensitive, l.sourceText, l.editedAt
       FROM posts p JOIN local_posts l ON l.postId = p.postId WHERE p.postId = ?`,
    ).get(postId) as {
      content: string;
      summary: string | null;
      sensitive: number;
      sourceText: string | null;
      editedAt: number | null;
    };
  const sentActivities = () => t.federation.sendActivity.mock.calls.map((call) => call as unknown[]);
  return { ...t, me, alice, post, edit, source, rowOf, sentActivities };
};

describe('新規投稿の原文の保存', () => {
  it('投稿の原文を local_posts.sourceText に保存し、edited_at は null にする', async () => {
    const t = await setup();

    const response = await t.post({ status: '**bold** hi', content_type: 'text/markdown' });

    const status = StatusSchema.parse(await response.json());
    expect(status.edited_at).toBeNull();
    expect(t.rowOf(status.id)).toMatchObject({ sourceText: '**bold** hi', editedAt: null });
    expect(t.rowOf(status.id).content).toContain('<strong>bold</strong>');
  });

  it('返信の原文も保存する', async () => {
    const t = await setup();
    const parent = t.seed.addLocalPost(t.alice, 1_000);

    const response = await t.post({ status: 'reply <b>', in_reply_to_id: parent.postId });

    const status = StatusSchema.parse(await response.json());
    expect(t.rowOf(status.id).sourceText).toBe('reply <b>');
  });
});

describe('PUT /api/v1/statuses/:id', () => {
  it('本文・CW・センシティブを変え、edited_at を入れた Status を返す', async () => {
    const t = await setup();
    const created = StatusSchema.parse(await (await t.post({ status: 'before' })).json());

    const response = await t.edit(created.id, { status: 'after\nline', spoiler_text: 'warn', sensitive: true });

    expect(response.status).toBe(200);
    const status = StatusSchema.parse(await response.json());
    expect(status).toMatchObject({
      id: created.id,
      content: '<p>after<br />line</p>',
      spoiler_text: 'warn',
      sensitive: true,
    });
    expect(status.edited_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(t.rowOf(created.id)).toMatchObject({
      content: '<p>after<br>line</p>',
      summary: 'warn',
      sensitive: 1,
      sourceText: 'after\nline',
    });
    expect(t.rowOf(created.id).editedAt).toBe(Date.parse(status.edited_at!));
    const fetched = StatusSchema.parse(
      await (await t.request(`/api/v1/statuses/${created.id}`, { headers: t.me.bearer })).json(),
    );
    expect(fetched.edited_at).toBe(status.edited_at);
    const events = t.sqlite.prepare(`SELECT eventName FROM domain_events WHERE aggregateId = ? ORDER BY occurredAt`)
      .all(created.id) as unknown as ReadonlyArray<{ eventName: string }>;
    expect(events.map((event) => event.eventName)).toContain('post.updated');
  });

  it('text/markdown の本文は Markdown として HTML にする', async () => {
    const t = await setup();
    const created = StatusSchema.parse(await (await t.post({ status: 'before' })).json());

    const response = await t.edit(created.id, { status: '**after**', content_type: 'text/markdown' });

    expect(StatusSchema.parse(await response.json()).content).toContain('<strong>after</strong>');
    expect(t.rowOf(created.id).sourceText).toBe('**after**');
  });

  it('spoiler_text と sensitive を省くと現在の値を保つ', async () => {
    const t = await setup();
    const created = StatusSchema.parse(
      await (await t.post({ status: 'before', spoiler_text: 'warn', sensitive: true })).json(),
    );

    const response = await t.edit(created.id, { status: 'after' });

    expect(StatusSchema.parse(await response.json())).toMatchObject({
      spoiler_text: 'warn',
      sensitive: true,
      content: '<p>after</p>',
    });
  });

  it('空の spoiler_text で CW を外せる', async () => {
    const t = await setup();
    const created = StatusSchema.parse(await (await t.post({ status: 'before', spoiler_text: 'warn' })).json());

    const response = await t.edit(created.id, { status: 'after', spoiler_text: '', sensitive: false });

    expect(StatusSchema.parse(await response.json())).toMatchObject({ spoiler_text: '', sensitive: false });
    expect(t.rowOf(created.id).summary).toBeNull();
  });

  it('公開範囲・返信先・引用先は変えない', async () => {
    const t = await setup();
    const parent = t.seed.addLocalPost(t.alice, 1_000);
    const created = StatusSchema.parse(
      await (await t.post({ status: 'before', visibility: 'unlisted', in_reply_to_id: parent.postId })).json(),
    );

    const response = await t.edit(created.id, { status: 'after', visibility: 'public', in_reply_to_id: undefined });

    expect(StatusSchema.parse(await response.json())).toMatchObject({
      visibility: 'unlisted',
      in_reply_to_id: parent.postId,
    });
  });

  it('他人の投稿とリモートの投稿は 404 にして変えない', async () => {
    const t = await setup();
    const theirs = t.seed.addLocalPost(t.alice, 1_000, { content: '<p>theirs</p>' });
    const remote = t.seed.addRemotePost(t.seed.addRemoteActor('bob'), 2_000, { visibility: 'public' });

    const responses = await Promise.all([
      t.edit(theirs.postId, { status: 'x' }),
      t.edit(remote.postId, { status: 'x' }),
      t.edit(crypto.randomUUID(), { status: 'x' }),
      t.edit('nope', { status: 'x' }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(notFound);
    }
    expect(t.rowOf(theirs.postId)).toMatchObject({ content: '<p>theirs</p>', editedAt: null });
    expect(t.sentActivities()).toHaveLength(0);
  });

  it('status がないか空白だけのとき 422 にして変えない', async () => {
    const t = await setup();
    const created = StatusSchema.parse(await (await t.post({ status: 'before' })).json());

    const responses = [await t.edit(created.id, {}), await t.edit(created.id, { status: ' \n' })];

    for (const response of responses) {
      expect(response.status).toBe(422);
      expect(((await response.json()) as { error: string }).error).toMatch(/^Validation failed: /);
    }
    expect(t.rowOf(created.id)).toMatchObject({ sourceText: 'before', editedAt: null });
  });

  it('書き込み権限のないトークンは 403 にする', async () => {
    const t = await setup();
    const created = StatusSchema.parse(await (await t.post({ status: 'before' })).json());

    const response = await t.request(`/api/v1/statuses/${created.id}`, {
      method: 'PUT',
      headers: { ...(await t.bearerFor('read')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'after' }),
    });

    expect(response.status).toBe(403);
    expect(t.rowOf(created.id).editedAt).toBeNull();
  });
});

describe('GET /api/v1/statuses/:id/source', () => {
  it('新規投稿は保存した原文を返す', async () => {
    const t = await setup();
    const created = StatusSchema.parse(
      await (await t.post({ status: '*raw* <text>', spoiler_text: 'cw', content_type: 'text/markdown' })).json(),
    );

    const response = await t.source(created.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: created.id, text: '*raw* <text>', spoiler_text: 'cw' });
  });

  it('編集後は編集後の原文を返す', async () => {
    const t = await setup();
    const created = StatusSchema.parse(await (await t.post({ status: 'before' })).json());
    await t.edit(created.id, { status: 'after', spoiler_text: 'new' });

    expect(await (await t.source(created.id)).json()).toEqual({ id: created.id, text: 'after', spoiler_text: 'new' });
  });

  it('原文のない既存の投稿は HTML から戻したテキストを返す', async () => {
    const t = await setup();
    const own = t.seed.addLocalPost(t.me, 1_000, { content: '<p>Hello <b>world</b></p><p>second</p>' });

    const response = await t.source(own.postId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: own.postId, text: 'Hello world\nsecond', spoiler_text: '' });
  });

  it('原文のない既存の投稿も編集でき、編集後は新しい原文を返す', async () => {
    const t = await setup();
    const own = t.seed.addLocalPost(t.me, 1_000, { content: '<p>legacy</p>' });

    const response = await t.edit(own.postId, { status: 'fixed' });

    expect(response.status).toBe(200);
    expect(await (await t.source(own.postId)).json()).toMatchObject({ text: 'fixed' });
  });

  it('他人の投稿とリモートの投稿は 404 にする', async () => {
    const t = await setup();
    const theirs = t.seed.addLocalPost(t.alice, 1_000);
    const remote = t.seed.addRemotePost(t.seed.addRemoteActor('bob'), 2_000, { visibility: 'public' });

    for (const id of [theirs.postId, remote.postId, crypto.randomUUID()]) {
      const response = await t.source(id);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(notFound);
    }
  });
});

describe('PUT /api/v1/statuses/:id の配送', () => {
  const aliceId = 'https://remote.example/users/alice';

  const withRemoteAlice = async (options: Parameters<typeof setupReadApi>[0] = {}) => {
    const t = await setup(options);
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
    return t;
  };

  const noteOf = async (activity: unknown): Promise<Note> => {
    expect(activity).toBeInstanceOf(Update);
    const note = await (activity as Update).getObject();
    expect(note).toBeInstanceOf(Note);
    return note as Note;
  };

  it('フォロワーに Update(Note) を送り、Note の content と updated を新しい値にする', async () => {
    const t = await setup();
    const created = StatusSchema.parse(await (await t.post({ status: 'before' })).json());
    t.federation.sendActivity.mockClear();

    const response = await t.edit(created.id, { status: 'after', spoiler_text: 'warn' });

    const status = StatusSchema.parse(await response.json());
    const sent = t.sentActivities();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[0]).toEqual({ identifier: 'kosui' });
    expect(sent[0]?.[1]).toBe('followers');
    const note = await noteOf(sent[0]?.[2]);
    expect(note.id?.href).toBe(`${ORIGIN}/users/kosui/posts/${created.id}`);
    expect(note.content?.toString()).toBe('<p>after</p>');
    expect(note.summary?.toString()).toBe('warn');
    expect(note.sensitive).toBe(true);
    expect(note.updated?.epochMilliseconds).toBe(Date.parse(status.edited_at!));
    expect(note.published?.epochMilliseconds).toBe(Date.parse(status.created_at));
  });

  it('編集後の本文のメンションの相手にも送る', async () => {
    const t = await withRemoteAlice();
    const created = StatusSchema.parse(await (await t.post({ status: 'hi' })).json());
    t.federation.sendActivity.mockClear();

    const response = await t.edit(created.id, { status: 'hi @alice@remote.example' });

    expect(response.status).toBe(200);
    const sent = t.sentActivities();
    expect(sent).toHaveLength(2);
    expect(sent[0]?.[1]).toBe('followers');
    expect(sent[1]?.[1]).toEqual([{
      id: new URL(aliceId),
      inboxId: new URL(`${aliceId}/inbox`),
      endpoints: { sharedInbox: new URL('https://remote.example/inbox') },
    }]);
    const note = await noteOf(sent[1]?.[2]);
    expect(note.content?.toString()).toContain(`href="${aliceId}"`);
    expect((await Array.fromAsync(note.getTags())).map((tag) => (tag as { href?: URL }).href?.href)).toEqual([aliceId]);
  });

  describe('編集前の宛先', () => {
    const bobId = 'https://remote.example/users/bob';
    const mentionOf = (href: string, acct: string) =>
      `<span class="h-card"><a href="${href}" class="u-url mention">@<span>${acct}</span></a></span>`;
    const tagHrefsOf = async (note: Note) =>
      (await Array.fromAsync(note.getTags())).map((tag) => (tag as { href?: URL }).href?.href);

    it('リモートの投稿への返信を @ の無い本文に編集しても、返信先の作者に Update を送り、Note の cc に残す', async () => {
      const t = await setup();
      const parent = t.seed.addRemotePost(t.seed.addRemoteActor('bob'), 1_000, { visibility: 'public' });
      const reply = t.seed.addLocalPost(t.me, 2_000, { content: '<p>reply</p>', inReplyToUri: parent.uri });

      const response = await t.edit(reply.postId, { status: 'edited' });

      expect(response.status).toBe(200);
      const sent = t.sentActivities();
      expect(sent).toHaveLength(2);
      expect(sent[1]?.[1]).toEqual([
        expect.objectContaining({ id: new URL(bobId), inboxId: new URL(`${bobId}/inbox`) }),
      ]);
      const note = await noteOf(sent[1]?.[2]);
      expect(note.content?.toString()).toBe('<p>edited</p>');
      expect(note.ccIds.map((id) => id.href)).toContain(bobId);
      expect(await tagHrefsOf(note)).toEqual([bobId]);
    });

    it('編集で消したメンションの相手にも Update を送り、Note の cc に残す', async () => {
      const t = await setup();
      t.seed.addRemoteActor('bob');
      const own = t.seed.addLocalPost(t.me, 1_000, {
        content: `<p>hi ${mentionOf(bobId, 'bob@remote.example')}</p>`,
      });

      const response = await t.edit(own.postId, { status: 'hi' });

      expect(response.status).toBe(200);
      const sent = t.sentActivities();
      expect(sent).toHaveLength(2);
      expect(sent[1]?.[1]).toEqual([
        expect.objectContaining({ id: new URL(bobId), inboxId: new URL(`${bobId}/inbox`) }),
      ]);
      const note = await noteOf(sent[1]?.[2]);
      expect(note.content?.toString()).toBe('<p>hi</p>');
      expect(note.ccIds.map((id) => id.href)).toContain(bobId);
      expect(await tagHrefsOf(note)).toEqual([bobId]);
    });

    it('消したメンションの相手が未保存なら、リモートから引いて送る', async () => {
      const t = await setup();
      const carolId = 'https://elsewhere.example/users/carol';
      t.federation.lookupObject.mockResolvedValue(
        new Person({
          id: new URL(carolId),
          inbox: new URL(`${carolId}/inbox`),
          endpoints: new Endpoints({ sharedInbox: new URL('https://elsewhere.example/inbox') }),
        }),
      );
      const own = t.seed.addLocalPost(t.me, 1_000, {
        content: `<p>hi ${mentionOf(carolId, 'carol@elsewhere.example')}</p>`,
      });

      await t.edit(own.postId, { status: 'hi' });

      const sent = t.sentActivities();
      expect(sent).toHaveLength(2);
      expect(sent[1]?.[1]).toEqual([{
        id: new URL(carolId),
        inboxId: new URL(`${carolId}/inbox`),
        endpoints: { sharedInbox: new URL('https://elsewhere.example/inbox') },
      }]);
    });

    it('編集前の宛先と編集後のメンションが重なっても、同じ相手に二度送らない', async () => {
      const t = await withRemoteAlice();
      t.seed.addRemoteActor('alice');
      const own = t.seed.addLocalPost(t.me, 1_000, {
        content: `<p>hi ${mentionOf(aliceId, 'alice@remote.example')}</p>`,
      });

      await t.edit(own.postId, { status: 'hello @alice@remote.example' });

      const sent = t.sentActivities();
      expect(sent).toHaveLength(2);
      expect(sent[1]?.[1]).toHaveLength(1);
      const note = await noteOf(sent[1]?.[2]);
      expect(await tagHrefsOf(note)).toEqual([aliceId]);
    });

    it('以前の編集で外したメンションの相手にも、その後の編集の Update を送り、Note の cc と tags に残す', async () => {
      const t = await withRemoteAlice();
      t.seed.addRemoteActor('alice');
      const created = StatusSchema.parse(await (await t.post({ status: 'hi @alice@remote.example' })).json());
      await t.edit(created.id, { status: 'hi' });
      t.federation.sendActivity.mockClear();

      const response = await t.edit(created.id, { status: 'hi again' });

      expect(response.status).toBe(200);
      const sent = t.sentActivities();
      expect(sent).toHaveLength(2);
      expect(sent[1]?.[1]).toEqual([
        expect.objectContaining({ id: new URL(aliceId), inboxId: new URL(`${aliceId}/inbox`) }),
      ]);
      const note = await noteOf(sent[1]?.[2]);
      expect(note.content?.toString()).toBe('<p>hi again</p>');
      expect(note.ccIds.map((id) => id.href)).toContain(aliceId);
      expect(await tagHrefsOf(note)).toEqual([aliceId]);
    });

    describe('版を組み立てられないとき', () => {
      const withoutVersions = async (versions: ReadonlyArray<PostVersion>) => {
        const t = await withRemoteAlice({ postVersionsResolver: { resolve: async () => RA.ok(versions) } });
        t.seed.addRemoteActor('alice');
        const created = StatusSchema.parse(await (await t.post({ status: 'hi @alice@remote.example' })).json());
        await t.edit(created.id, { status: 'hi' });
        t.federation.sendActivity.mockClear();
        return { t, created };
      };

      it('版が空なら、編集直前の宛先だけで送る', async () => {
        const { t, created } = await withoutVersions([]);

        await t.edit(created.id, { status: 'hi again' });

        const sent = t.sentActivities();
        expect(sent).toHaveLength(1);
        expect(sent[0]?.[1]).toBe('followers');
      });

      it('現在の版だけなら、編集直前の宛先だけで送る', async () => {
        const { t, created } = await withoutVersions([
          { content: '<p>hi</p>', summary: null, sensitive: false, createdAt: Instant.now() },
        ]);

        await t.edit(created.id, { status: 'hi again' });

        const sent = t.sentActivities();
        expect(sent).toHaveLength(1);
        expect(sent[0]?.[1]).toBe('followers');
      });
    });
  });

  it('引用先を保ち、RE: の段落を付け直して、引用先の作者にも送る', async () => {
    const t = await setup();
    const bob = t.seed.addRemoteActor('bob');
    const quoted = t.seed.addRemotePost(bob, 1_000, { visibility: 'public' });
    const created = StatusSchema.parse(
      await (await t.post({ status: 'look', quoted_status_id: quoted.postId })).json(),
    );
    t.federation.sendActivity.mockClear();

    const response = await t.edit(created.id, { status: 'look again' });

    const status = StatusSchema.parse(await response.json());
    expect(status.content).toBe(`<p>look again</p><p>RE: <a href="${quoted.uri}">${quoted.uri}</a></p>`);
    expect(status.quote).toMatchObject({ state: 'accepted', quoted_status: { id: quoted.postId } });
    expect(t.rowOf(created.id).sourceText).toBe('look again');
    const sent = t.sentActivities();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.[1]).toEqual([
      expect.objectContaining({
        id: new URL('https://remote.example/users/bob'),
        inboxId: new URL('https://remote.example/users/bob/inbox'),
      }),
    ]);
    const note = await noteOf(sent[1]?.[2]);
    expect(note.quoteUrl?.href).toBe(quoted.uri);
  });

  describe('ダイレクトの投稿', () => {
    const postDirect = async (t: Awaited<ReturnType<typeof withRemoteAlice>>, extra: Record<string, unknown> = {}) =>
      StatusSchema.parse(
        await (await t.post({ status: 'hi @alice@remote.example', visibility: 'direct', ...extra })).json(),
      );

    it('フォロワーには送らず、メンションの相手にだけ共有 inbox を使わずに Update を送る', async () => {
      const t = await withRemoteAlice();
      t.seed.addRelay();
      const created = await postDirect(t);
      t.federation.sendActivity.mockClear();

      const response = await t.edit(created.id, { status: 'hello @alice@remote.example' });

      expect(response.status).toBe(200);
      const sent = t.sentActivities();
      expect(sent).toHaveLength(1);
      expect(sent[0]?.[1]).toEqual([expect.objectContaining({ id: new URL(aliceId) })]);
      expect(sent[0]?.[3]).toEqual({ preferSharedInbox: false });
      const note = await noteOf(sent[0]?.[2]);
      expect(note.toIds.map((id) => id.href)).toEqual([aliceId]);
      expect(note.ccIds).toEqual([]);
    });

    it('他サーバーのメンションの無い本文に編集すると 422 にして変えない', async () => {
      const t = await withRemoteAlice();
      const created = await postDirect(t);
      t.federation.sendActivity.mockClear();

      const response = await t.edit(created.id, { status: 'no mention' });

      expect(response.status).toBe(422);
      expect(((await response.json()) as { error: string }).error).toBe(
        'Validation failed: Direct statuses must mention at least one account on another server',
      );
      expect(t.rowOf(created.id)).toMatchObject({ sourceText: 'hi @alice@remote.example', editedAt: null });
      expect(t.sentActivities()).toHaveLength(0);
    });

    it('引用付きの投稿を編集しても、引用先の作者には送らず、Note の引用先は保つ', async () => {
      const t = await withRemoteAlice();
      const quoted = t.seed.addRemotePost(t.seed.addRemoteActor('bob'), 1_000, { visibility: 'public' });
      const created = await postDirect(t, { quoted_status_id: quoted.postId });
      t.federation.sendActivity.mockClear();

      const response = await t.edit(created.id, { status: 'again @alice@remote.example' });

      expect(response.status).toBe(200);
      const sent = t.sentActivities();
      expect(sent).toHaveLength(1);
      expect(sent[0]?.[1]).toEqual([expect.objectContaining({ id: new URL(aliceId) })]);
      const note = await noteOf(sent[0]?.[2]);
      expect(note.quoteUrl?.href).toBe(quoted.uri);
      expect(note.ccIds.map((id) => id.href)).not.toContain('https://remote.example/users/bob');
      expect((await Array.fromAsync(note.getTags())).map((tag) => (tag as { href?: URL }).href?.href)).toEqual([
        aliceId,
      ]);
    });
  });

  it('画像を Note の添付に保つ', async () => {
    const t = await setup();
    const media = await t.addMedia(t.me.userId, 'alt');
    const created = StatusSchema.parse(
      await (await t.post({ status: 'pic', media_ids: [media.mediaId] })).json(),
    );
    t.federation.sendActivity.mockClear();

    const response = await t.edit(created.id, { status: 'pic edited' });

    expect(StatusSchema.parse(await response.json()).media_attachments).toHaveLength(1);
    const note = await noteOf(t.sentActivities()[0]?.[2]);
    const attachments = await Array.fromAsync(note.getAttachments());
    expect(attachments).toHaveLength(1);
  });

  it('公開の投稿は承認済みのリレーにも送る', async () => {
    const t = await setup();
    const relayId = t.seed.addRelay();
    const created = StatusSchema.parse(await (await t.post({ status: 'before', visibility: 'public' })).json());
    t.federation.sendActivity.mockClear();

    await t.edit(created.id, { status: 'after' });

    const sent = t.sentActivities();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.[1]).toEqual({
      id: new URL(`https://relay.example/${relayId}`),
      inboxId: new URL(`https://relay.example/${relayId}/inbox`),
    });
    await noteOf(sent[1]?.[2]);
  });

  it.each(['unlisted', 'private'] as const)('%s の投稿はリレーに送らない', async (visibility) => {
    const t = await setup();
    t.seed.addRelay();
    const created = StatusSchema.parse(await (await t.post({ status: 'before', visibility })).json());
    t.federation.sendActivity.mockClear();

    await t.edit(created.id, { status: 'after' });

    const sent = t.sentActivities();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[1]).toBe('followers');
  });

  it('Bluesky のクロスポストの処理を呼ばない', async () => {
    const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };
    const t = await setup({ scheduleBlueskyCrosspost });
    const created = StatusSchema.parse(await (await t.post({ status: 'before' })).json());
    expect(scheduleBlueskyCrosspost.run).toHaveBeenCalledTimes(1);

    const response = await t.edit(created.id, { status: 'after' });

    expect(response.status).toBe(200);
    expect(scheduleBlueskyCrosspost.run).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/statuses/:id/history', () => {
  const history = (t: Awaited<ReturnType<typeof setup>>, id: string) =>
    t.request(`/api/v1/statuses/${id}/history`, { headers: t.me.bearer });

  it('未編集の投稿は現在の版を 1 件返す', async () => {
    const t = await setup();
    const created = StatusSchema.parse(
      await (await t.post({ status: 'only', spoiler_text: 'cw', sensitive: true })).json(),
    );

    const response = await history(t, created.id);

    expect(response.status).toBe(200);
    const edits = StatusEditSchema.array().parse(await response.json());
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      content: '<p>only</p>',
      spoiler_text: 'cw',
      sensitive: true,
      created_at: created.created_at,
      account: created.account,
      media_attachments: [],
      emojis: [],
      poll: null,
    });
  });

  it('2 回編集した投稿は古い順に 3 件返し、版ごとに中身と日時が違う', async () => {
    const t = await setup();
    const created = StatusSchema.parse(await (await t.post({ status: 'v1' })).json());
    const first = StatusSchema.parse(
      await (await t.edit(created.id, { status: 'v2', spoiler_text: 'cw' })).json(),
    );
    const second = StatusSchema.parse(
      await (await t.edit(created.id, { status: 'v3', spoiler_text: '', sensitive: true })).json(),
    );

    const edits = StatusEditSchema.array().parse(await (await history(t, created.id)).json());

    expect(edits.map(({ content, spoiler_text, sensitive }) => ({ content, spoiler_text, sensitive }))).toEqual([
      { content: '<p>v1</p>', spoiler_text: '', sensitive: false },
      { content: '<p>v2</p>', spoiler_text: 'cw', sensitive: true },
      { content: '<p>v3</p>', spoiler_text: '', sensitive: true },
    ]);
    expect(edits.map((edit) => edit.created_at)).toEqual([created.created_at, first.edited_at, second.edited_at]);
  });

  it('他人の公開の投稿とリモートの投稿は、現在の版を 1 件返す', async () => {
    const t = await setup();
    const theirs = t.seed.addLocalPost(t.alice, 1_000, { content: '<p>theirs</p>' });
    const remote = t.seed.addRemotePost(t.seed.addRemoteActor('bob'), 2_000, {
      content: '<p>remote</p>',
      visibility: 'public',
    });

    for (const [id, content] of [[theirs.postId, '<p>theirs</p>'], [remote.postId, '<p>remote</p>']] as const) {
      const response = await history(t, id);

      expect(response.status).toBe(200);
      const edits = StatusEditSchema.array().parse(await response.json());
      expect(edits).toHaveLength(1);
      expect(edits[0]?.content).toBe(content);
    }
  });

  it('見られない投稿と存在しない ID は 404 にする', async () => {
    const t = await setup();
    const hidden = t.seed.addRemotePost(t.seed.addRemoteActor('bob'), 1_000, { visibility: 'direct' });

    for (const id of [hidden.postId, crypto.randomUUID(), 'nope']) {
      const response = await history(t, id);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(notFound);
    }
  });
});
