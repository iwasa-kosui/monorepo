import { afterEach, describe, expect, it, vi } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UpdateRemotePostUseCase } from '../../../useCase/updateRemotePost.ts';
import { createD1ActorResolverByUri } from '../actor/actorResolverByUri.ts';
import { createD1PostImagesReplacedStore } from '../image/postImagesReplacedStore.ts';
import { createD1LinkPreviewCreatedStore } from '../linkPreview/linkPreviewCreatedStore.ts';
import { createD1LinkPreviewsDeletedStore } from '../linkPreview/linkPreviewsDeletedStore.ts';
import { createD1LinkPreviewsResolverByPostId } from '../linkPreview/linkPreviewsResolverByPostId.ts';
import { createD1PostResolverByUri } from '../post/postResolverByUri.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../post/postWithAuthorBatch.ts';
import { createD1RemotePostRecipientsResolverByPostId } from '../post/remotePostRecipientsResolverByPostId.ts';
import { createD1RemotePostUpdatedStore } from '../post/remotePostUpdatedStore.ts';
import { createMastodonSeed, SEED_ORIGIN } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const kosuiUri = `${SEED_ORIGIN}/users/kosui`;
const hanakoUri = `${SEED_ORIGIN}/users/hanako`;

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const alice = seed.addRemoteActor('alice');
  const mallory = seed.addRemoteActor('mallory');
  seed.addLocalActor('kosui');
  seed.addLocalActor('hanako');
  const post = seed.addRemotePost(alice, 1_000, {
    content: '<p>before</p>',
    visibility: 'direct',
    recipientActorUris: [kosuiUri],
  });
  fixture.sqlite.prepare('UPDATE posts SET summary = ?, sensitive = 1 WHERE postId = ?').run('old cw', post.postId);
  fixture.sqlite.prepare('INSERT INTO post_images(imageId,postId,url,altText,createdAt) VALUES (?,?,?,?,?)').run(
    '00000000-0000-4000-8000-0000000000aa',
    post.postId,
    'https://remote.example/media/old.png',
    'old alt',
    1_000,
  );
  const ogpFetcher = {
    fetch: vi.fn(async (url: string) => ({
      title: `title of ${url}`,
      description: null,
      imageUrl: null,
      faviconUrl: null,
      siteName: null,
    })),
  };
  const { db } = fixture;
  const useCase = UpdateRemotePostUseCase.create({
    origin: SEED_ORIGIN,
    postResolverByUri: createD1PostResolverByUri(db),
    actorResolverByUri: createD1ActorResolverByUri(db),
    remotePostRecipientsResolver: createD1RemotePostRecipientsResolverByPostId(db),
    postImagesReplacedStore: createD1PostImagesReplacedStore(db),
    remotePostUpdatedStore: createD1RemotePostUpdatedStore(db),
    linkPreviewsResolver: createD1LinkPreviewsResolverByPostId(db),
    linkPreviewCreatedStore: createD1LinkPreviewCreatedStore(db),
    linkPreviewsDeletedStore: createD1LinkPreviewsDeletedStore(db),
    ogpFetcher,
  });
  const input = (overrides: Partial<Parameters<typeof useCase.run>[0]> = {}) => ({
    uri: post.uri,
    actorUri: 'https://remote.example/users/alice',
    content: '<p>after</p>',
    summary: 'new cw',
    sensitive: false,
    attachments: [{ url: 'https://remote.example/media/new.png', altText: 'new alt' }],
    recipientActorUris: [hanakoUri],
    editedAt: Instant.orThrow(5_000),
    ...overrides,
  });
  const row = () =>
    fixture.sqlite.prepare(
      'SELECT p.content, p.summary, p.sensitive, p.createdAt, r.visibility, r.editedAt FROM posts p JOIN remote_posts r ON r.postId = p.postId WHERE p.postId = ?',
    ).get(post.postId);
  const images = () =>
    fixture.sqlite.prepare('SELECT url, altText FROM post_images WHERE postId = ? ORDER BY url').all(post.postId);
  const recipients = () =>
    (fixture.sqlite.prepare('SELECT actorUri FROM remote_post_recipients WHERE postId = ?').all(post.postId) as {
      actorUri: string;
    }[]).map((r) => r.actorUri);
  const events = () =>
    (fixture.sqlite.prepare('SELECT eventName, eventPayload FROM domain_events WHERE eventName = ?').all(
      'post.remotePostUpdated',
    ) as { eventName: string; eventPayload: string }[]).map((event) => ({
      ...event,
      eventPayload: JSON.parse(event.eventPayload) as Record<string, unknown>,
    }));
  const unchanged = {
    content: '<p>before</p>',
    summary: 'old cw',
    sensitive: 1,
    createdAt: 1_000,
    visibility: 'direct',
    editedAt: null,
  };
  return {
    ...fixture,
    seed,
    alice,
    mallory,
    post,
    useCase,
    input,
    row,
    images,
    recipients,
    events,
    ogpFetcher,
    unchanged,
  };
};

describe('リモート投稿の編集の保存', () => {
  it('本文、CW、センシティブ、添付、宛先、編集時刻を更新し、公開範囲と作成時刻は変えない', async () => {
    const t = setup();

    const result = await t.useCase.run(t.input({ sensitive: true }));

    expect(result).toMatchObject({ ok: true, val: { type: 'updated' } });
    expect(t.row()).toEqual({
      content: '<p>after</p>',
      summary: 'new cw',
      sensitive: 1,
      createdAt: 1_000,
      visibility: 'direct',
      editedAt: 5_000,
    });
    expect(t.images()).toEqual([{ url: 'https://remote.example/media/new.png', altText: 'new alt' }]);
    expect(t.recipients()).toEqual([hanakoUri]);
  });

  it('CW を外した編集では summary を null に戻し、添付を外した編集では添付を消す', async () => {
    const t = setup();

    await t.useCase.run(t.input({ summary: null, attachments: [], recipientActorUris: [] }));

    expect(t.row()).toMatchObject({ summary: null, editedAt: 5_000 });
    expect(t.images()).toEqual([]);
    expect(t.recipients()).toEqual([]);
  });

  it('更新イベントの payload に更新の前と後の宛先を入れて domain_events に保存する', async () => {
    const t = setup();

    await t.useCase.run(t.input({ recipientActorUris: [hanakoUri, kosuiUri] }));

    const [event, ...rest] = t.events();
    expect(rest).toEqual([]);
    expect(event.eventPayload).toMatchObject({
      postId: t.post.postId,
      content: '<p>after</p>',
      editedAt: 5_000,
      previousRecipientActorUris: [kosuiUri],
      recipientActorUris: [hanakoUri, kosuiUri],
    });
  });

  it('宛先が束縛数の上限を超える数あっても更新できる', async () => {
    const t = setup();
    const uris = Array.from({ length: 95 }, (_, n) => `${SEED_ORIGIN}/users/user${n}`);

    await t.useCase.run(t.input({ recipientActorUris: uris }));

    expect(t.recipients()).toHaveLength(95);
  });

  it('actor が投稿の作者でなければ何も更新しない', async () => {
    const t = setup();

    const result = await t.useCase.run(t.input({ actorUri: 'https://remote.example/users/mallory' }));

    expect(result).toMatchObject({ ok: false, err: { type: 'RemotePostUpdateAuthorMismatchError' } });
    expect(t.row()).toEqual(t.unchanged);
    expect(t.images()).toEqual([{ url: 'https://remote.example/media/old.png', altText: 'old alt' }]);
    expect(t.recipients()).toEqual([kosuiUri]);
    expect(t.events()).toEqual([]);
  });

  it('DB にないアクターからの更新は何も更新しない', async () => {
    const t = setup();

    const result = await t.useCase.run(t.input({ actorUri: 'https://unknown.example/users/eve' }));

    expect(result).toMatchObject({ ok: false, err: { type: 'RemotePostUpdateAuthorMismatchError' } });
    expect(t.row()).toEqual(t.unchanged);
  });

  it('保存済みの投稿がなければ何もしない', async () => {
    const t = setup();

    const result = await t.useCase.run(t.input({ uri: 'https://remote.example/notes/unknown' }));

    expect(result).toMatchObject({ ok: true, val: { type: 'postNotFound' } });
    expect(t.row()).toEqual(t.unchanged);
    expect(t.events()).toEqual([]);
  });

  it('保存済みの編集時刻より新しくない更新は無視する', async () => {
    const t = setup();
    await t.useCase.run(t.input());

    const older = await t.useCase.run(t.input({ content: '<p>older</p>', editedAt: Instant.orThrow(4_000) }));
    const same = await t.useCase.run(t.input({ content: '<p>same</p>', editedAt: Instant.orThrow(5_000) }));

    expect(older).toMatchObject({ ok: true, val: { type: 'staleEdit' } });
    expect(same).toMatchObject({ ok: true, val: { type: 'staleEdit' } });
    expect(t.row()).toMatchObject({ content: '<p>after</p>', editedAt: 5_000 });
  });

  it('より新しい更新は上書きする', async () => {
    const t = setup();
    await t.useCase.run(t.input());

    await t.useCase.run(t.input({ content: '<p>newer</p>', editedAt: Instant.orThrow(6_000) }));

    expect(t.row()).toMatchObject({ content: '<p>newer</p>', editedAt: 6_000 });
  });

  it('同じ更新を 2 回受けても結果が変わらず、イベントも 1 件だけになる', async () => {
    const t = setup();

    await t.useCase.run(t.input());
    const afterFirst = { row: t.row(), images: t.images(), recipients: t.recipients() };
    const second = await t.useCase.run(t.input());

    expect(second).toMatchObject({ ok: true, val: { type: 'staleEdit' } });
    expect({ row: t.row(), images: t.images(), recipients: t.recipients() }).toEqual(afterFirst);
    expect(t.events()).toHaveLength(1);
  });

  it('リンクのプレビューは、本文から消えた URL の分を消し、足された URL の分を取得する', async () => {
    const t = setup();
    t.sqlite.prepare(
      'INSERT INTO link_previews(linkPreviewId,postId,url,title,createdAt) VALUES (?,?,?,?,?), (?,?,?,?,?)',
    ).run(
      '00000000-0000-4000-8000-0000000000b1',
      t.post.postId,
      'https://old.example/a',
      'old',
      1_000,
      '00000000-0000-4000-8000-0000000000b2',
      t.post.postId,
      'https://kept.example/b',
      'kept',
      1_000,
    );

    await t.useCase.run(t.input({
      content: '<p><a href="https://kept.example/b">b</a> <a href="https://new.example/c">c</a></p>',
    }));

    const urls = t.sqlite.prepare('SELECT url, title FROM link_previews WHERE postId = ? ORDER BY url').all(
      t.post.postId,
    );
    expect(urls).toEqual([
      { url: 'https://kept.example/b', title: 'kept' },
      { url: 'https://new.example/c', title: 'title of https://new.example/c' },
    ]);
    expect(t.ogpFetcher.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('API に出す編集時刻', () => {
  it('編集された投稿の editedAt を返し、編集されていない投稿は null を返す', async () => {
    const t = setup();
    const untouched = t.seed.addRemotePost(t.alice, 2_000, {});
    await t.useCase.run(t.input());

    const result = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: [PostId.orThrow(t.post.postId), PostId.orThrow(untouched.postId)],
      currentActorId: undefined,
    });

    if (!result.ok) throw new Error('unreachable');
    const edited = result.val.get(PostId.orThrow(t.post.postId));
    const notEdited = result.val.get(PostId.orThrow(untouched.postId));
    expect(edited).toMatchObject({ type: 'remote', editedAt: 5_000, content: '<p>after</p>' });
    expect(notEdited).toMatchObject({ type: 'remote', editedAt: null });
  });
});
