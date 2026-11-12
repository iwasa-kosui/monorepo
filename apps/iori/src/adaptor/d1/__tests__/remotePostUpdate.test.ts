import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageId } from '../../../domain/image/imageId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post, type RemotePost } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UpdateRemotePostUseCase } from '../../../useCase/updateRemotePost.ts';
import { createD1ActorResolverByUri } from '../actor/actorResolverByUri.ts';
import { createD1PostImagesResolverByPostId } from '../image/postImagesResolver.ts';
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
    postImagesResolver: createD1PostImagesResolverByPostId(db),
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
    attachments: [{ url: 'https://remote.example/media/new.png', altText: 'new alt', mediaType: 'image/png' }],
    recipientActorUris: [hanakoUri],
    visibility: 'direct' as const,
    editedAt: Instant.orThrow(5_000),
    ...overrides,
  });
  const row = () =>
    fixture.sqlite.prepare(
      'SELECT p.content, p.summary, p.sensitive, p.createdAt, r.visibility, r.editedAt FROM posts p JOIN remote_posts r ON r.postId = p.postId WHERE p.postId = ?',
    ).get(post.postId);
  const images = () =>
    fixture.sqlite.prepare('SELECT url, altText FROM post_images WHERE postId = ? ORDER BY url').all(post.postId);
  const imageIds =
    () => (fixture.sqlite.prepare('SELECT imageId, url FROM post_images WHERE postId = ? ORDER BY url').all(
      post.postId,
    ) as {
      imageId: string;
      url: string;
    }[]);
  const setVisibility = (visibility: string | null) =>
    fixture.sqlite.prepare('UPDATE remote_posts SET visibility = ? WHERE postId = ?').run(visibility, post.postId);
  const storedPost = async (): Promise<RemotePost> => {
    const resolved = await createD1PostResolverByUri(db).resolve({ uri: post.uri });
    if (!resolved.ok || !resolved.val) throw new Error('unreachable');
    return resolved.val;
  };
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
    imageIds,
    setVisibility,
    storedPost,
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
    expect(t.sqlite.prepare('SELECT mediaType FROM post_images WHERE postId = ?').all(t.post.postId)).toEqual([
      { mediaType: 'image/png' },
    ]);
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

describe('添付の imageId', () => {
  const oldImageId = '00000000-0000-4000-8000-0000000000aa';

  it('url が同じ添付は imageId と作成時刻を使い回し、altText を新しい値にする', async () => {
    const t = setup();

    await t.useCase.run(t.input({
      attachments: [
        { url: 'https://remote.example/media/old.png', altText: 'new alt', mediaType: 'image/png' },
        { url: 'https://remote.example/media/new.png', altText: null, mediaType: null },
      ],
    }));

    const [fresh, kept] = t.imageIds();
    expect(kept).toEqual({ imageId: oldImageId, url: 'https://remote.example/media/old.png' });
    expect(fresh.imageId).not.toBe(oldImageId);
    expect(t.images()).toEqual([
      { url: 'https://remote.example/media/new.png', altText: null },
      { url: 'https://remote.example/media/old.png', altText: 'new alt' },
    ]);
    expect(
      t.sqlite.prepare('SELECT createdAt FROM post_images WHERE imageId = ?').get(oldImageId),
    ).toEqual({ createdAt: 1_000 });
  });

  it('同じ url の添付が重複しても主キーが衝突せず、使い回すのは 1 件だけにする', async () => {
    const t = setup();

    await t.useCase.run(t.input({
      attachments: [
        { url: 'https://remote.example/media/old.png', altText: 'a', mediaType: null },
        { url: 'https://remote.example/media/old.png', altText: 'b', mediaType: null },
      ],
    }));

    const rows = t.imageIds();
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.imageId === oldImageId)).toHaveLength(1);
  });
});

describe('公開範囲を狭める更新', () => {
  it.each(
    [
      ['public', 'unlisted', 'unlisted'],
      ['public', 'direct', 'direct'],
      ['unlisted', 'private', 'private'],
      ['private', 'direct', 'direct'],
      [null, 'direct', 'direct'],
    ] as const,
  )('保存済みが %s の投稿への %s の更新は %s にする', async (stored, incoming, expected) => {
    const t = setup();
    t.setVisibility(stored);

    await t.useCase.run(t.input({ visibility: incoming }));

    expect(t.row()).toMatchObject({ visibility: expected });
  });

  it.each(
    [
      ['direct', 'public', 'direct'],
      ['direct', 'private', 'direct'],
      ['private', 'unlisted', 'private'],
      ['unlisted', 'public', 'unlisted'],
      ['public', 'public', 'public'],
      ['public', null, 'public'],
      [null, 'public', null],
      [null, 'private', null],
      [null, null, null],
    ] as const,
  )('保存済みが %s の投稿への %s の更新では %s のまま変えない', async (stored, incoming, expected) => {
    const t = setup();
    t.setVisibility(stored);

    await t.useCase.run(t.input({ visibility: incoming }));

    expect(t.row()).toMatchObject({ visibility: expected, content: '<p>after</p>' });
  });
});

describe('direct の投稿の参加者', () => {
  const aliceUri = 'https://remote.example/users/alice';
  const bobUri = 'https://other.example/users/bob';

  const participants = (t: ReturnType<typeof setup>) =>
    (t.sqlite.prepare('SELECT actorUri FROM direct_post_participants WHERE postId = ? ORDER BY actorUri').all(
      t.post.postId,
    ) as { actorUri: string }[]).map((row) => row.actorUri);

  const seedParticipants = (t: ReturnType<typeof setup>, uris: ReadonlyArray<string>) => {
    for (const uri of uris) {
      t.sqlite.prepare('INSERT INTO direct_post_participants(postId,actorUri) VALUES (?,?)').run(t.post.postId, uri);
    }
  };

  it('宛先とメンションが増えたら参加者に足し、外れた宛先は消さない', async () => {
    const t = setup();
    seedParticipants(t, [aliceUri, kosuiUri]);

    await t.useCase.run(t.input({ recipientActorUris: [hanakoUri], mentionedActorUris: [bobUri] }));

    expect(participants(t)).toEqual([aliceUri, bobUri, hanakoUri, kosuiUri].sort());
    expect(t.recipients()).toEqual([hanakoUri]);
  });

  it('同じ宛先で編集しても参加者は重複せず、行数が変わらない', async () => {
    const t = setup();
    seedParticipants(t, [aliceUri, kosuiUri]);

    await t.useCase.run(t.input({ recipientActorUris: [kosuiUri] }));

    expect(participants(t)).toEqual([aliceUri, kosuiUri].sort());
  });

  it('更新イベントの payload に参加者を入れる', async () => {
    const t = setup();

    await t.useCase.run(t.input({ recipientActorUris: [hanakoUri], mentionedActorUris: [bobUri] }));

    expect(t.events()[0]?.eventPayload).toMatchObject({
      participantActorUris: [aliceUri, bobUri, hanakoUri],
    });
  });

  it('direct でない投稿の編集では、参加者を保存しない', async () => {
    const t = setup();
    t.setVisibility('public');

    await t.useCase.run(t.input({ visibility: 'public', mentionedActorUris: [bobUri] }));

    expect(participants(t)).toEqual([]);
  });

  it('公開範囲が direct に狭まる編集では、作者と宛先を参加者にする', async () => {
    const t = setup();
    t.setVisibility('private');

    await t.useCase.run(t.input({ visibility: 'direct' }));

    expect(t.row()).toMatchObject({ visibility: 'direct' });
    expect(participants(t)).toEqual([aliceUri, hanakoUri].sort());
  });

  it('保存済みの編集時刻より新しくない更新では、参加者を足さない', async () => {
    const t = setup();
    await t.useCase.run(t.input());

    await t.useCase.run(t.input({ editedAt: Instant.orThrow(4_000), mentionedActorUris: [bobUri] }));

    expect(participants(t)).toEqual([aliceUri, hanakoUri].sort());
  });

  it('参加者が束縛数の上限を超える数あっても保存できる', async () => {
    const t = setup();
    const uris = Array.from({ length: 95 }, (_, n) => `${SEED_ORIGIN}/users/user${n}`);

    await t.useCase.run(t.input({ recipientActorUris: uris }));

    expect(participants(t)).toHaveLength(96);
  });
});

describe('同時に来た更新の競合', () => {
  it('古い編集時刻の書き込みが新しい編集の後に走っても、何も変えない', async () => {
    const t = setup();
    t.setVisibility('public');
    const stored = await t.storedPost();
    const edit = {
      summary: null,
      sensitive: false,
      previousRecipientActorUris: [kosuiUri],
    };
    const newer = Post.updateRemotePost(Instant.orThrow(8_000))(stored, {
      ...edit,
      content: '<p>newer</p>',
      editedAt: Instant.orThrow(6_000),
      visibility: 'direct',
      recipientActorUris: [hanakoUri],
      images: [{
        imageId: ImageId.orThrow('00000000-0000-4000-8000-0000000000bb'),
        postId: stored.postId,
        url: 'https://remote.example/media/newer.png',
        altText: 'newer',
        mediaType: null,
        createdAt: Instant.orThrow(8_000),
      }],
    });
    const older = Post.updateRemotePost(Instant.orThrow(9_000))(stored, {
      ...edit,
      content: '<p>older</p>',
      editedAt: Instant.orThrow(5_000),
      visibility: 'public',
      recipientActorUris: [kosuiUri, hanakoUri],
      images: [{
        imageId: ImageId.orThrow('00000000-0000-4000-8000-0000000000cc'),
        postId: stored.postId,
        url: 'https://remote.example/media/older.png',
        altText: 'older',
        mediaType: null,
        createdAt: Instant.orThrow(9_000),
      }],
    });
    const store = createD1RemotePostUpdatedStore(t.db);

    await store.store(newer);
    await store.store(older);

    expect(t.row()).toMatchObject({ content: '<p>newer</p>', editedAt: 6_000, visibility: 'direct' });
    expect(t.images()).toEqual([{ url: 'https://remote.example/media/newer.png', altText: 'newer' }]);
    expect(t.recipients()).toEqual([hanakoUri]);
    expect(t.events()).toHaveLength(1);
    expect(t.events()[0].eventPayload).toMatchObject({ content: '<p>newer</p>' });
  });

  it('新しい編集でも、読んだ時点の公開範囲から広げる内容なら、保存済みの狭い公開範囲を広げない', async () => {
    const t = setup();
    t.setVisibility('public');
    const stored = await t.storedPost();
    const edit = {
      summary: null,
      sensitive: false,
      previousRecipientActorUris: [kosuiUri],
      recipientActorUris: [hanakoUri],
      images: [],
    };
    const narrowing = Post.updateRemotePost(Instant.orThrow(8_000))(stored, {
      ...edit,
      content: '<p>narrowing</p>',
      editedAt: Instant.orThrow(6_000),
      visibility: 'direct',
    });
    const later = Post.updateRemotePost(Instant.orThrow(9_000))(stored, {
      ...edit,
      content: '<p>later</p>',
      editedAt: Instant.orThrow(7_000),
      visibility: 'public',
    });
    const store = createD1RemotePostUpdatedStore(t.db);

    await store.store(narrowing);
    await store.store(later);

    expect(t.row()).toMatchObject({ content: '<p>later</p>', editedAt: 7_000, visibility: 'direct' });
    expect(t.events()).toHaveLength(2);
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
