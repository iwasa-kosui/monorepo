import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { BLUESKY_SENSITIVE_SELF_LABEL } from '../../adaptor/bluesky/blueskyPostRecord.ts';
import { createBlueskyThumbnailFetcher } from '../../adaptor/bluesky/thumbnailFetcher.ts';
import { createMastodonSeed, SEED_ORIGIN } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyCrosspostDeletedStore } from '../../adaptor/d1/blueskyCrosspost/blueskyCrosspostDeletedStore.ts';
import { createD1BlueskyCrosspostResolver } from '../../adaptor/d1/blueskyCrosspost/blueskyCrosspostResolver.ts';
import { createD1BlueskyCrosspostSavedStore } from '../../adaptor/d1/blueskyCrosspost/blueskyCrosspostSavedStore.ts';
import { createD1BlueskyCrosspostsResolverByRetryable } from '../../adaptor/d1/blueskyCrosspost/blueskyCrosspostsResolverByRetryable.ts';
import { createD1BlueskyTimelineItemsDeletedStore } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsDeletedStore.ts';
import { createD1PostImagesResolverByPostId } from '../../adaptor/d1/image/postImagesResolver.ts';
import { createD1LinkPreviewsResolverByPostId } from '../../adaptor/d1/linkPreview/linkPreviewsResolverByPostId.ts';
import { createD1LocalPostResolverByUri } from '../../adaptor/d1/post/localPostResolverByUri.ts';
import { createD1PostResolver } from '../../adaptor/d1/post/postResolver.ts';
import { createD1UserResolver } from '../../adaptor/d1/user/userResolver.ts';
import { BlueskyCrosspost } from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyBlob, BlueskyPostRecord } from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { blueskyRkeyOf } from '../../domain/blueskyCrosspost/blueskyRkey.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { BlueskyClient, BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import type { PostImageObjectStore } from '../../ports/postImageObjectStore.ts';
import { RemoveBlueskyCrosspostUseCase } from '../removeBlueskyCrosspost.ts';
import { RetryBlueskyCrosspostsUseCase } from '../retryBlueskyCrossposts.ts';
import { ScheduleBlueskyCrosspostUseCase } from '../scheduleBlueskyCrosspost.ts';
import { SendBlueskyCrosspostUseCase } from '../sendBlueskyCrosspost.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12, 0));
const CREATED_AT = Date.UTC(2026, 10, 8, 11, 0);
const LINK_PREVIEW_ID = '00000000-0000-4000-8000-0000000000aa';

const failure = (message: string): BlueskyClientError => ({ type: 'BlueskyClientError', kind: 'http', message });

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const { db, sqlite } = fixture;
  const seed = createMastodonSeed(fixture);
  const actor = seed.addLocalActor('kosui');
  const waiting: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => {
    waiting.push(promise);
  };
  const flush = async () => {
    await Promise.all(waiting.splice(0));
  };

  const uploaded: Array<{ bytes: Uint8Array; mimeType: string }> = [];
  const created: BlueskyPostRecord[] = [];
  const deleted: string[] = [];
  const rkeys: string[] = [];
  const behavior = {
    createRecord: (
      _record: BlueskyPostRecord,
      _rkey: string,
    ): Result<{ uri: string; cid: string; rkey: string }, BlueskyClientError> =>
      Result.ok({
        uri: `at://did:plc:abc/app.bsky.feed.post/3k${created.length}`,
        cid: `bafycid${created.length}`,
        rkey: `3k${created.length}`,
      }),
    getRecord: (_rkey: string): Result<{ uri: string; cid: string; rkey: string }, BlueskyClientError> =>
      Result.err(failure('getRecord failed: status 400 RecordNotFound')),
    deleteRecord: (): Result<void, BlueskyClientError> => Result.ok(undefined),
    uploadBlob: (): Result<void, BlueskyClientError> => Result.ok(undefined),
  };
  const client: BlueskyClient = {
    uploadBlob: async (input) => {
      uploaded.push(input);
      const failed = behavior.uploadBlob();
      if (!failed.ok) return failed;
      const blob: BlueskyBlob = {
        $type: 'blob',
        ref: { $link: `blob${uploaded.length}` },
        mimeType: input.mimeType,
        size: input.bytes.byteLength,
      };
      return RA.ok(blob);
    },
    createRecord: async (record, rkey) => {
      rkeys.push(rkey);
      const result = behavior.createRecord(record, rkey);
      if (result.ok) created.push(record);
      return result;
    },
    getRecord: async (rkey) => behavior.getRecord(rkey),
    deleteRecord: async (rkey) => {
      deleted.push(rkey);
      return behavior.deleteRecord();
    },
    createLike: async () => RA.err(failure('createLike is not used')),
    deleteLike: async () => RA.err(failure('deleteLike is not used')),
    createRepost: async () => RA.err(failure('createRepost is not used')),
    deleteRepost: async () => RA.err(failure('deleteRepost is not used')),
    muteActor: async () => RA.err(failure('muteActor is not used')),
    unmuteActor: async () => RA.err(failure('unmuteActor is not used')),
    muteThread: async () => RA.err(failure('muteThread is not used')),
    unmuteThread: async () => RA.err(failure('unmuteThread is not used')),
    createBlock: async () => RA.err(failure('createBlock is not used')),
    deleteBlock: async () => RA.err(failure('deleteBlock is not used')),
    createReport: async () => RA.err(failure('createReport is not used')),
    createFollow: async () => RA.err(failure('createFollow is not used')),
    deleteFollow: async () => RA.err(failure('deleteFollow is not used')),
    updateSeen: async () => RA.err(failure('updateSeen is not used')),
    createBookmark: async () => RA.err(failure('createBookmark is not used')),
    deleteBookmark: async () => RA.err(failure('deleteBookmark is not used')),
  };

  const handleDids = new Map<string, string>([['alice.bsky.social', 'did:plc:alice']]);
  const queryBehavior = { throws: false };
  const query = vi.fn<BlueskyQueryClient['query']>(async (_nsid, params) => {
    if (queryBehavior.throws) throw new Error('network down');
    const did = handleDids.get(params.handle ?? '');
    return did === undefined ? RA.err(failure('resolveHandle failed: status 400')) : RA.ok({ did });
  });

  const stored = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const uploads: PostImageObjectStore = {
    put: async () => ({ key: 'unused', url: 'unused' }),
    get: async (imageId) => {
      const entry = stored.get(imageId);
      if (entry === undefined) return undefined;
      return {
        key: imageId,
        body: new Blob([entry.bytes.slice()]).stream() as never,
        contentType: entry.contentType,
      };
    },
  };
  const thumbnails = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const thumbnailFetcher = { fetch: async (url: string) => thumbnails.get(url) };

  const postResolver = createD1PostResolver(db);
  const localPostResolverByUri = createD1LocalPostResolverByUri(db, SEED_ORIGIN);
  const crosspostResolver = createD1BlueskyCrosspostResolver(db);
  const crosspostSavedStore = createD1BlueskyCrosspostSavedStore(db);
  const crosspostDeletedStore = createD1BlueskyCrosspostDeletedStore(db);
  const timelineItemsDeletedStore = createD1BlueskyTimelineItemsDeletedStore(db);
  const send = SendBlueskyCrosspostUseCase.create({
    postResolver,
    userResolver: createD1UserResolver(db),
    localPostResolverByUri,
    postImagesResolver: createD1PostImagesResolverByPostId(db),
    linkPreviewsResolver: createD1LinkPreviewsResolverByPostId(db),
    crosspostResolver,
    crosspostSavedStore,
    crosspostDeletedStore,
    timelineItemsDeletedStore,
    uploads,
    thumbnailFetcher,
    client,
    query,
    origin: SEED_ORIGIN,
    now: () => NOW,
  });
  const schedule = ScheduleBlueskyCrosspostUseCase.create({
    postResolver,
    localPostResolverByUri,
    crosspostResolver,
    crosspostSavedStore,
    send,
    waitUntil,
    now: () => NOW,
  });
  const remove = RemoveBlueskyCrosspostUseCase.create({
    crosspostResolver,
    crosspostSavedStore,
    crosspostDeletedStore,
    timelineItemsDeletedStore,
    client,
    waitUntil,
    now: () => NOW,
  });
  const retry = RetryBlueskyCrosspostsUseCase.create({
    crosspostsResolverByRetryable: createD1BlueskyCrosspostsResolverByRetryable(db),
    crosspostSavedStore,
    crosspostDeletedStore,
    timelineItemsDeletedStore,
    client,
    send,
    now: () => NOW,
  });

  const addPost = (
    options: {
      content?: string;
      inReplyToUri?: string | null;
      summary?: string | null;
      sensitive?: boolean;
      visibility?: 'public' | 'unlisted' | 'private';
    } = {},
  ) => {
    const post = seed.addLocalPost(actor, CREATED_AT, {
      content: options.content ?? '<p>こんにちは <a href="https://example.com/x">example.com/x</a></p>',
      inReplyToUri: options.inReplyToUri,
      visibility: options.visibility,
    });
    sqlite.prepare('UPDATE posts SET summary = ?, sensitive = ? WHERE postId = ?').run(
      options.summary ?? null,
      options.sensitive === true ? 1 : 0,
      post.postId,
    );
    return { ...post, postId: post.postId as PostId };
  };
  const insertTimelineItem = (feedItemId: string, uri: string, repostedByDid: string | null = null) =>
    sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(feedItemId, uri, 'cid', 'did:plc:abc', 'kosui.bsky.social', 'text', '[]', repostedByDid, 1, 1, 1);
  const timelineFeedItemIds = () =>
    (sqlite.prepare('SELECT feedItemId FROM bluesky_timeline_items ORDER BY feedItemId').all() as Array<
      { feedItemId: string }
    >).map(({ feedItemId }) => feedItemId);
  const row = async (postId: string) => Result.unsafeUnwrap(await crosspostResolver.resolve(postId as PostId));
  const addStoredImage = (postId: string, contentType: string, bytes: Uint8Array, alt: string | null = null) => {
    const imageId = seed.addImage(postId, `/uploads/PLACEHOLDER.png`, alt);
    sqlite.prepare('UPDATE post_images SET url = ? WHERE imageId = ?').run(`/uploads/${imageId}.png`, imageId);
    stored.set(imageId, { bytes, contentType });
    return imageId;
  };
  return {
    fixture,
    seed,
    actor,
    sqlite,
    flush,
    waiting,
    uploaded,
    created,
    deleted,
    rkeys,
    behavior,
    query,
    handleDids,
    queryBehavior,
    stored,
    thumbnails,
    thumbnailFetcher,
    send,
    schedule,
    remove,
    retry,
    addPost,
    addStoredImage,
    insertTimelineItem,
    timelineFeedItemIds,
    row,
  };
};

const run = async <T>(promise: RA<T, never>): Promise<T> => Result.unsafeUnwrap(await promise);

describe('ScheduleBlueskyCrosspostUseCase と SendBlueskyCrosspostUseCase', () => {
  it('pending を入れて waitUntil で送り、sent と uri、cid、rkey を保存する', async () => {
    const t = setup();
    const post = t.addPost();

    expect(await run(t.schedule.run({ postId: post.postId }))).toBe('pending');
    expect(await t.row(post.postId)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(t.created).toEqual([]);

    await t.flush();

    expect(t.created).toHaveLength(1);
    expect(t.created[0]).toMatchObject({
      $type: 'app.bsky.feed.post',
      text: 'こんにちは example.com/x',
      createdAt: new Date(CREATED_AT).toISOString(),
      facets: [{
        index: { byteStart: 16, byteEnd: 29 },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/x' }],
      }],
    });
    expect(t.created[0]).not.toHaveProperty('langs');
    expect(await t.row(post.postId)).toMatchObject({
      status: 'sent',
      uri: 'at://did:plc:abc/app.bsky.feed.post/3k0',
      cid: 'bafycid0',
      rkey: '3k0',
      rootUri: null,
      rootCid: null,
      updatedAt: NOW,
    });
  });

  it('同じ投稿を 2 回予約しても 1 回しか送らない', async () => {
    const t = setup();
    const post = t.addPost();

    await run(t.schedule.run({ postId: post.postId }));
    expect(await run(t.schedule.run({ postId: post.postId }))).toBe('noop');
    await t.flush();
    await run(t.send.run({ postId: post.postId }));

    expect(t.created).toHaveLength(1);
  });

  it('CW 付きの投稿は sent になり、CW の文と投稿 URL だけを送る', async () => {
    const t = setup();
    const post = t.addPost({ summary: '注意', content: '<p>本文 <a href="https://example.com/x">x</a></p>' });
    t.addStoredImage(post.postId, 'image/png', new Uint8Array([1, 2, 3]), '猫');

    expect(await run(t.schedule.run({ postId: post.postId }))).toBe('pending');
    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({ status: 'sent', skipReason: null });
    expect(t.created).toHaveLength(1);
    expect(t.created[0]?.text).toBe(`注意\n${SEED_ORIGIN}/users/kosui/posts/${post.postId}`);
    expect(t.uploaded).toEqual([]);
    expect(t.created[0]).not.toHaveProperty('embed');
    expect(t.created[0]).not.toHaveProperty('labels');
  });

  it('CW 付きでも、公開でなければ skipped になり visibility を理由にして送らない', async () => {
    const t = setup();
    const post = t.addPost({ summary: '注意', visibility: 'unlisted' });

    expect(await run(t.schedule.run({ postId: post.postId }))).toBe('skipped');
    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({ status: 'skipped', skipReason: 'visibility' });
    expect(t.created).toEqual([]);
  });

  it('sensitive だけの投稿は sent になり、画像を upload して record に labels を付ける', async () => {
    const t = setup();
    const post = t.addPost({ sensitive: true });
    t.addStoredImage(post.postId, 'image/png', new Uint8Array([1, 2, 3]), '猫');

    expect(await run(t.schedule.run({ postId: post.postId }))).toBe('pending');
    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({ status: 'sent', skipReason: null });
    expect(t.uploaded).toHaveLength(1);
    expect(t.created[0]?.embed?.$type).toBe('app.bsky.embed.images');
    expect(t.created[0]?.labels).toEqual({
      $type: 'com.atproto.label.defs#selfLabels',
      values: [{ val: BLUESKY_SENSITIVE_SELF_LABEL }],
    });
  });

  it('親が送信済みの返信は root と parent を付け、行に root を保存する', async () => {
    const t = setup();
    const parent = t.addPost({ content: '<p>親</p>' });
    await run(t.schedule.run({ postId: parent.postId }));
    await t.flush();
    const reply = t.addPost({ content: '<p>返信</p>', inReplyToUri: parent.uri });

    await run(t.schedule.run({ postId: reply.postId }));
    await t.flush();

    const parentRef = { uri: 'at://did:plc:abc/app.bsky.feed.post/3k0', cid: 'bafycid0' };
    expect(t.created[1]?.reply).toEqual({ root: parentRef, parent: parentRef });
    expect(await t.row(reply.postId)).toMatchObject({
      status: 'sent',
      uri: 'at://did:plc:abc/app.bsky.feed.post/3k1',
      rootUri: parentRef.uri,
      rootCid: parentRef.cid,
    });

    const nested = t.addPost({ content: '<p>孫</p>', inReplyToUri: reply.uri });
    await run(t.schedule.run({ postId: nested.postId }));
    await t.flush();
    expect(t.created[2]?.reply).toEqual({
      root: parentRef,
      parent: { uri: 'at://did:plc:abc/app.bsky.feed.post/3k1', cid: 'bafycid1' },
    });
  });

  it('親が送信済みでない返信と、他人の投稿への返信は reply_to_unsent で skipped にする', async () => {
    const t = setup();
    const remote = t.seed.addRemoteActor('alice');
    const remotePost = t.seed.addRemotePost(remote, 1_000);
    const skippedParent = t.addPost({ inReplyToUri: remotePost.uri });
    await run(t.schedule.run({ postId: skippedParent.postId }));
    const replyToSkipped = t.addPost({ inReplyToUri: skippedParent.uri });
    const replyToRemote = t.addPost({ inReplyToUri: remotePost.uri });
    const neverScheduled = t.addPost();
    const replyToNeverScheduled = t.addPost({ inReplyToUri: neverScheduled.uri });

    for (const post of [replyToSkipped, replyToRemote, replyToNeverScheduled]) {
      expect(await run(t.schedule.run({ postId: post.postId }))).toBe('skipped');
      expect(await t.row(post.postId)).toMatchObject({ status: 'skipped', skipReason: 'reply_to_unsent' });
    }
    await t.flush();
    expect(t.created).toEqual([]);
  });

  it('R2 の画像を alt つきで送り、1,000,000 bytes を超える画像は外して画像の URL を付ける', async () => {
    const t = setup();
    const post = t.addPost({ content: '<p>写真</p>' });
    t.addStoredImage(post.postId, 'image/png', new Uint8Array([1, 2, 3]), '猫');
    const bigImageId = t.addStoredImage(post.postId, 'image/jpeg', new Uint8Array(1_000_001), 'big');
    t.sqlite.prepare('UPDATE post_images SET createdAt = createdAt + 1 WHERE altText = ?').run('big');

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.uploaded).toHaveLength(1);
    expect(Array.from(t.uploaded[0]!.bytes)).toEqual([1, 2, 3]);
    expect(t.uploaded[0]?.mimeType).toBe('image/png');
    expect(t.created[0]?.text).toBe(`写真\nhttps://iori.test/uploads/${bigImageId}.png`);
    expect(t.created[0]?.embed).toMatchObject({
      $type: 'app.bsky.embed.images',
      images: [{ alt: '猫', image: { ref: { $link: 'blob1' }, mimeType: 'image/png', size: 3 } }],
    });
  });

  it('R2 から読めない画像は外して画像の URL を付ける', async () => {
    const t = setup();
    const post = t.addPost({ content: '<p>写真</p>' });
    t.seed.addImage(post.postId, 'https://remote.example/elsewhere.png');

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.created[0]?.text).toBe('写真\nhttps://remote.example/elsewhere.png');
    expect(t.created[0]?.embed).toBeUndefined();
  });

  it('画像が無ければ linkPreview を external にし、thumb を取得して送る', async () => {
    const t = setup();
    const post = t.addPost({ content: '<p>記事</p>' });
    t.sqlite.prepare(
      'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(LINK_PREVIEW_ID, post.postId, 'https://example.com/a', 'タイトル', '説明', '/thumb.png', null, null, 1);
    t.thumbnails.set('https://example.com/thumb.png', { bytes: new Uint8Array([9, 9]), mimeType: 'image/png' });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.created[0]?.embed).toEqual({
      $type: 'app.bsky.embed.external',
      external: {
        uri: 'https://example.com/a',
        title: 'タイトル',
        description: '説明',
        thumb: { $type: 'blob', ref: { $link: 'blob1' }, mimeType: 'image/png', size: 2 },
      },
    });
  });

  it('thumb の取得に失敗したら thumb なしで送る', async () => {
    const t = setup();
    const post = t.addPost({ content: '<p>記事</p>' });
    t.sqlite.prepare(
      'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      LINK_PREVIEW_ID,
      post.postId,
      'https://example.com/a',
      'タイトル',
      null,
      'https://example.com/none.png',
      null,
      null,
      1,
    );

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.created[0]?.embed).toEqual({
      $type: 'app.bsky.embed.external',
      external: { uri: 'https://example.com/a', title: 'タイトル', description: '' },
    });
  });

  it('送信に失敗したら failed、attempts + 1、秘密を含まない lastError を保存し、予約の結果は変えない', async () => {
    const t = setup();
    t.behavior.createRecord = () => Result.err(failure('createRecord failed: status 500'));
    const post = t.addPost();

    expect(await run(t.schedule.run({ postId: post.postId }))).toBe('pending');
    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'createRecord failed: status 500',
      updatedAt: NOW,
    });
  });

  it('画像の uploadBlob に失敗したら failed にして createRecord を呼ばない', async () => {
    const t = setup();
    t.behavior.uploadBlob = () => Result.err(failure('uploadBlob failed: status 413'));
    const post = t.addPost();
    t.addStoredImage(post.postId, 'image/png', new Uint8Array([1]));

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({ status: 'failed', lastError: 'uploadBlob failed: status 413' });
    expect(t.created).toEqual([]);
  });

  it('thumb の uploadBlob に失敗しても thumb なしで送る', async () => {
    const t = setup();
    t.behavior.uploadBlob = () => Result.err(failure('uploadBlob failed: status 400'));
    const post = t.addPost({ content: '<p>記事</p>' });
    t.sqlite.prepare(
      'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(LINK_PREVIEW_ID, post.postId, 'https://example.com/a', 'タイトル', null, '/t.png', null, null, 1);
    t.thumbnails.set('https://example.com/t.png', { bytes: new Uint8Array([1]), mimeType: 'image/png' });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({ status: 'sent' });
    expect(t.created[0]?.embed).toEqual({
      $type: 'app.bsky.embed.external',
      external: { uri: 'https://example.com/a', title: 'タイトル', description: '' },
    });
  });

  it('本文の Bluesky のハンドルを、DID に解決して mention facet にして送る', async () => {
    const t = setup();
    const post = t.addPost({
      content: '<p>こんにちは @alice.bsky.social さん <a href="https://example.com/x">example.com/x</a></p>',
    });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.query).toHaveBeenCalledTimes(1);
    expect(t.query).toHaveBeenCalledWith('com.atproto.identity.resolveHandle', { handle: 'alice.bsky.social' });
    expect(t.created[0]?.facets).toEqual([
      {
        index: { byteStart: 16, byteEnd: 34 },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }],
      },
      {
        index: { byteStart: 42, byteEnd: 55 },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/x' }],
      },
    ]);
    expect(await t.row(post.postId)).toMatchObject({ status: 'sent' });
  });

  it('リンクと重なるハンドルには mention facet を付けない', async () => {
    const t = setup();
    const post = t.addPost({
      content: '<p><a href="https://mastodon.example/@alice.bsky.social">@alice.bsky.social</a></p>',
    });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.created[0]?.facets).toEqual([{
      index: { byteStart: 0, byteEnd: 18 },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://mastodon.example/@alice.bsky.social' }],
    }]);
    expect(t.query).not.toHaveBeenCalled();
  });

  it('異なるハンドルが11件以上あっても、先頭から10件までしか解決せず、11件目以降に facet を付けない', async () => {
    const t = setup();
    const handles = Array.from({ length: 12 }, (_, index) => `user${index + 1}.bsky.social`);
    for (const handle of handles) t.handleDids.set(handle, `did:plc:${handle}`);
    const post = t.addPost({ content: `<p>${handles.map((handle) => `@${handle}`).join(' ')}</p>` });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.query).toHaveBeenCalledTimes(10);
    expect(t.query.mock.calls.map(([, params]) => params.handle)).toEqual(handles.slice(0, 10));
    expect(t.created[0]?.facets).toHaveLength(10);
    expect(await t.row(post.postId)).toMatchObject({ status: 'sent' });
  });

  it('本文が切り詰められてハンドルが途中で切れたら、そのハンドルを解決せず facet も付けない', async () => {
    const t = setup();
    t.handleDids.set('bob.example.co', 'did:plc:bobco');
    const filler = 'あ'.repeat(210);
    const post = t.addPost({ content: `<p>${filler} @bob.example.com ${'い'.repeat(400)}</p>` });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.created[0]?.text).toMatch(/@bob\.example\.co…\n/);
    expect(t.query).not.toHaveBeenCalled();
    expect(t.created[0]?.facets?.every(({ features }) => features[0]?.$type !== 'app.bsky.richtext.facet#mention'))
      .toBe(true);
  });

  it('複数のハンドルのうち解決できたものにだけ、mention facet を付ける', async () => {
    const t = setup();
    const post = t.addPost({ content: '<p>@nobody.bsky.social @alice.bsky.social</p>' });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.query).toHaveBeenCalledTimes(2);
    expect(t.created[0]?.facets).toEqual([{
      index: { byteStart: 20, byteEnd: 38 },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }],
    }]);
  });

  it('解決できないハンドルには facet を付けず、sent にする', async () => {
    const t = setup();
    const post = t.addPost({ content: '<p>@nobody.bsky.social こんにちは</p>' });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.query).toHaveBeenCalledTimes(1);
    expect(t.created[0]?.text).toBe('@nobody.bsky.social こんにちは');
    expect(t.created[0]).not.toHaveProperty('facets');
    expect(await t.row(post.postId)).toMatchObject({ status: 'sent' });
  });

  it('ハンドルの解決で例外が起きても、mention facet なしで sent にする', async () => {
    const t = setup();
    t.queryBehavior.throws = true;
    const post = t.addPost({ content: '<p>@alice.bsky.social こんにちは</p>' });

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.created[0]?.text).toBe('@alice.bsky.social こんにちは');
    expect(t.created[0]).not.toHaveProperty('facets');
    expect(await t.row(post.postId)).toMatchObject({ status: 'sent' });
  });

  it('本文にハンドルが無ければ、ハンドルを解決しない', async () => {
    const t = setup();
    const post = t.addPost();

    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.query).not.toHaveBeenCalled();
  });

  it('予約の途中で例外が起きても reject せず error を返す', async () => {
    const t = setup();
    const post = t.addPost();
    t.sqlite.exec('DROP TABLE bluesky_crossposts');

    await expect(run(t.schedule.run({ postId: post.postId }))).resolves.toBe('error');
    expect(t.waiting).toEqual([]);
  });

  it('送信の途中で例外が起きたら failed にして reject しない', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    t.behavior.createRecord = () => {
      throw new Error('boom secret-token');
    };

    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({ status: 'failed', attempts: 1, lastError: 'unexpected error' });
  });

  it('送信時に投稿が消えていれば行を消す', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    t.sqlite.exec('PRAGMA foreign_keys=OFF');
    t.sqlite.prepare('DELETE FROM local_posts WHERE postId = ?').run(post.postId);
    t.sqlite.prepare('DELETE FROM timeline_items WHERE postId = ?').run(post.postId);
    t.sqlite.prepare('DELETE FROM posts WHERE postId = ?').run(post.postId);

    await t.flush();

    expect(await t.row(post.postId)).toBeUndefined();
    expect(t.created).toEqual([]);
  });
});

describe('RemoveBlueskyCrosspostUseCase', () => {
  it('sent の行は waitUntil で deleteRecord を呼び、成功したら行を消す', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(await run(t.remove.run({ postId: post.postId }))).toBe('deleting');
    expect(t.waiting).toHaveLength(1);
    await t.flush();

    expect(t.deleted).toEqual(['3k0']);
    expect(await t.row(post.postId)).toBeUndefined();
  });

  it('deleteRecord に成功したら、同じ uri の取り込み済みの行を repost も含めて消し、ほかの uri の行は残す', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();
    const uri = 'at://did:plc:abc/app.bsky.feed.post/3k0';
    t.insertTimelineItem(uri, uri);
    t.insertTimelineItem(`${uri}#repost:did:plc:b`, uri, 'did:plc:b');
    t.insertTimelineItem('at://did:plc:other/app.bsky.feed.post/1', 'at://did:plc:other/app.bsky.feed.post/1');

    await run(t.remove.run({ postId: post.postId }));
    await t.flush();

    expect(await t.row(post.postId)).toBeUndefined();
    expect(t.timelineFeedItemIds()).toEqual(['at://did:plc:other/app.bsky.feed.post/1']);
  });

  it('deleteRecord に失敗したら、取り込み済みの行を消さない', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();
    const uri = 'at://did:plc:abc/app.bsky.feed.post/3k0';
    t.insertTimelineItem(uri, uri);
    t.behavior.deleteRecord = () => Result.err(failure('deleteRecord failed: status 500'));

    await run(t.remove.run({ postId: post.postId }));
    await t.flush();

    expect(t.timelineFeedItemIds()).toEqual([uri]);
  });

  it('uri が無い行を消すときは、取り込み済みの行に触れない', async () => {
    const t = setup();
    const post = t.addPost();
    await createD1BlueskyCrosspostSavedStore(t.fixture.db).save(BlueskyCrosspost.pending(post.postId, NOW));
    t.insertTimelineItem('at://did:plc:other/app.bsky.feed.post/1', 'at://did:plc:other/app.bsky.feed.post/1');

    await run(t.remove.run({ postId: post.postId }));

    expect(t.timelineFeedItemIds()).toEqual(['at://did:plc:other/app.bsky.feed.post/1']);
  });

  it('deleteRecord に失敗したら行を残す', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();
    t.behavior.deleteRecord = () => Result.err(failure('deleteRecord failed: status 500'));

    await run(t.remove.run({ postId: post.postId }));
    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({
      status: 'deleting',
      attempts: 1,
      lastError: 'deleteRecord failed: status 500',
      uri: 'at://did:plc:abc/app.bsky.feed.post/3k0',
      rkey: '3k0',
    });
  });

  it('deleteRecord を呼ぶ前に行を deleting で保存する', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();
    const statusesSeen: unknown[] = [];
    t.behavior.deleteRecord = () => {
      statusesSeen.push(t.sqlite.prepare('SELECT status FROM bluesky_crossposts WHERE postId = ?').get(post.postId));
      return Result.ok(undefined);
    };

    await run(t.remove.run({ postId: post.postId }));
    await t.flush();

    expect(statusesSeen).toEqual([{ status: 'deleting' }]);
    expect(await t.row(post.postId)).toBeUndefined();
  });

  it.each(['pending', 'failed', 'skipped'] as const)('%s の行は deleteRecord を呼ばずにすぐ消す', async (status) => {
    const t = setup();
    const post = t.addPost();
    const base = BlueskyCrosspost.pending(post.postId, NOW);
    const save = createD1BlueskyCrosspostSavedStore(t.fixture.db).save;
    await save(
      status === 'pending'
        ? base
        : status === 'failed'
        ? BlueskyCrosspost.markFailed(base, 'e', NOW)
        : BlueskyCrosspost.skipped(post.postId, 'sensitive', NOW),
    );

    expect(await run(t.remove.run({ postId: post.postId }))).toBe('removed');

    expect(await t.row(post.postId)).toBeUndefined();
    expect(t.deleted).toEqual([]);
    expect(t.waiting).toEqual([]);
  });

  it('対応表に行が無ければ何もしない', async () => {
    const t = setup();
    const post = t.addPost();
    expect(await run(t.remove.run({ postId: post.postId }))).toBe('noop');
    expect(t.deleted).toEqual([]);
  });
});

describe('RetryBlueskyCrosspostsUseCase', () => {
  const insertAged = (
    t: ReturnType<typeof setup>,
    postId: string,
    status: 'pending' | 'failed',
    createdAt: number,
    attempts = 0,
  ) =>
    t.sqlite.prepare(
      'INSERT INTO bluesky_crossposts(postId,status,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?)',
    ).run(postId, status, attempts, createdAt, createdAt);

  it('10 分以上前の pending と attempts が 3 未満の failed だけを再送する', async () => {
    const t = setup();
    const oldPending = t.addPost();
    const freshPending = t.addPost();
    const failedTwice = t.addPost();
    const failedThrice = t.addPost();
    insertAged(t, oldPending.postId, 'pending', NOW - 11 * 60_000);
    insertAged(t, freshPending.postId, 'pending', NOW - 5 * 60_000);
    insertAged(t, failedTwice.postId, 'failed', NOW - 60 * 60_000, 2);
    insertAged(t, failedThrice.postId, 'failed', NOW - 60 * 60_000, 3);

    const summary = await run(t.retry.run());

    expect(summary).toEqual({ sent: 2, failed: 0, skipped: 0, gone: 0, noop: 0, deleted: 0, deleteFailed: 0 });
    expect(await t.row(oldPending.postId)).toMatchObject({ status: 'sent' });
    expect(await t.row(failedTwice.postId)).toMatchObject({ status: 'sent' });
    expect(await t.row(freshPending.postId)).toMatchObject({ status: 'pending' });
    expect(await t.row(failedThrice.postId)).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('再送でも失敗したら attempts を増やし、消えた投稿の行は消す', async () => {
    const t = setup();
    t.behavior.createRecord = () => Result.err(failure('createRecord failed: status 502'));
    const failing = t.addPost();
    insertAged(t, failing.postId, 'failed', NOW - 60 * 60_000, 1);
    const goneId = '00000000-0000-4000-8000-0000000000ff';
    insertAged(t, goneId, 'pending', NOW - 60 * 60_000);

    const summary = await run(t.retry.run());

    expect(summary).toMatchObject({ failed: 1, gone: 1 });
    expect(await t.row(failing.postId)).toMatchObject({ status: 'failed', attempts: 2 });
    expect(await t.row(goneId)).toBeUndefined();
  });

  it('1 回に最大 20 件を古い順に再送する', async () => {
    const t = setup();
    const posts = Array.from({ length: 22 }, () => t.addPost());
    posts.forEach((post, index) => insertAged(t, post.postId, 'pending', NOW - (100 - index) * 60_000));

    const summary = await run(t.retry.run());

    expect(summary.sent).toBe(20);
    expect(await t.row(posts[0]!.postId)).toMatchObject({ status: 'sent' });
    expect(await t.row(posts[19]!.postId)).toMatchObject({ status: 'sent' });
    expect(await t.row(posts[20]!.postId)).toMatchObject({ status: 'pending' });
    expect(await t.row(posts[21]!.postId)).toMatchObject({ status: 'pending' });
  });

  it('削除済みの投稿の行は消されていて、再送されない', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    await run(t.remove.run({ postId: post.postId }));
    t.sqlite.prepare('UPDATE bluesky_crossposts SET createdAt = 0 WHERE 1 = 1').run();

    const summary = await run(t.retry.run());

    expect(summary).toEqual({ sent: 0, failed: 0, skipped: 0, gone: 0, noop: 0, deleted: 0, deleteFailed: 0 });
    expect(t.created).toEqual([]);
  });
});

describe('送信の回数制限と重複投稿の防止', () => {
  const insertRow = (
    t: ReturnType<typeof setup>,
    postId: string,
    status: 'pending' | 'failed' | 'deleting',
    attempts: number,
    createdAt: number,
    refs: { uri: string; cid: string; rkey: string } | undefined = undefined,
  ) =>
    t.sqlite.prepare(
      'INSERT INTO bluesky_crossposts(postId,status,attempts,uri,cid,rkey,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(postId, status, attempts, refs?.uri ?? null, refs?.cid ?? null, refs?.rkey ?? null, createdAt, createdAt);

  it('送信を始める前に attempts を 1 増やして保存する', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    const seen: unknown[] = [];
    t.behavior.createRecord = () => {
      seen.push(
        t.sqlite.prepare('SELECT status, attempts FROM bluesky_crossposts WHERE postId = ?').get(post.postId),
      );
      return Result.ok({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k0', cid: 'c', rkey: '3k0' });
    };

    await t.flush();

    expect(seen).toEqual([{ status: 'pending', attempts: 1 }]);
    expect(await t.row(post.postId)).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('途中で止まった pending は attempts が上限に達するまでしか再送しない', async () => {
    const t = setup();
    const post = t.addPost();
    insertRow(t, post.postId, 'pending', 0, NOW - 60 * 60_000);
    t.behavior.createRecord = () => {
      throw new Error('stalled');
    };

    for (let i = 0; i < 5; i += 1) await run(t.retry.run());

    expect(await t.row(post.postId)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(t.rkeys).toHaveLength(3);
  });

  it('postId と createdAt から決まる rkey を createRecord に渡す', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();

    expect(t.rkeys).toEqual([blueskyRkeyOf({ postId: post.postId, createdAt: Instant.orThrow(CREATED_AT) })]);
  });

  it('rkey が衝突して createRecord が失敗しても、getRecord で見つかれば sent にする', async () => {
    const t = setup();
    const post = t.addPost();
    t.behavior.createRecord = () => Result.err(failure('createRecord failed: status 400 InvalidRequest'));
    t.behavior.getRecord = (rkey) =>
      Result.ok({ uri: `at://did:plc:abc/app.bsky.feed.post/${rkey}`, cid: 'bafyexisting', rkey });
    await run(t.schedule.run({ postId: post.postId }));

    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({
      status: 'sent',
      uri: `at://did:plc:abc/app.bsky.feed.post/${t.rkeys[0]}`,
      cid: 'bafyexisting',
      rkey: t.rkeys[0],
      lastError: null,
    });
  });

  it('createRecord が失敗して getRecord でも見つからなければ、createRecord の失敗を failed に残す', async () => {
    const t = setup();
    const post = t.addPost();
    t.behavior.createRecord = () => Result.err(failure('createRecord failed: status 500'));
    await run(t.schedule.run({ postId: post.postId }));

    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'createRecord failed: status 500',
    });
  });
});

describe('送信中の削除と、削除の再試行', () => {
  const sentRefs = { uri: 'at://did:plc:abc/app.bsky.feed.post/3kdel', cid: 'bafydel', rkey: '3kdel' };
  const insertDeleting = (t: ReturnType<typeof setup>, postId: string, attempts: number) =>
    t.sqlite.prepare(
      'INSERT INTO bluesky_crossposts(postId,status,attempts,uri,cid,rkey,lastError,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      postId,
      'deleting',
      attempts,
      sentRefs.uri,
      sentRefs.cid,
      sentRefs.rkey,
      'deleteRecord failed: status 500',
      NOW - 60 * 60_000,
      NOW - 60 * 60_000,
    );

  it('送信中に行が消されたら、作った record をその場で deleteRecord し、行を作り直さない', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    t.behavior.createRecord = () => {
      t.sqlite.prepare('DELETE FROM bluesky_crossposts WHERE postId = ?').run(post.postId);
      return Result.ok({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kmid', cid: 'bafymid', rkey: '3kmid' });
    };

    await t.flush();

    expect(t.deleted).toEqual(['3kmid']);
    expect(await t.row(post.postId)).toBeUndefined();
  });

  it('送信中に投稿が消されたら、作った record を deleteRecord し、行も消す', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    t.behavior.createRecord = () => {
      t.sqlite.exec('PRAGMA foreign_keys=OFF');
      t.sqlite.prepare('DELETE FROM local_posts WHERE postId = ?').run(post.postId);
      t.sqlite.prepare('DELETE FROM timeline_items WHERE postId = ?').run(post.postId);
      t.sqlite.prepare('DELETE FROM posts WHERE postId = ?').run(post.postId);
      return Result.ok({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kmid', cid: 'bafymid', rkey: '3kmid' });
    };

    await t.flush();

    expect(t.deleted).toEqual(['3kmid']);
    expect(await t.row(post.postId)).toBeUndefined();
  });

  it('その場の deleteRecord が失敗したら、uri と rkey を持つ deleting の行に残し、再試行で消す', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    t.behavior.createRecord = () => {
      t.sqlite.exec('PRAGMA foreign_keys=OFF');
      t.sqlite.prepare('DELETE FROM local_posts WHERE postId = ?').run(post.postId);
      t.sqlite.prepare('DELETE FROM timeline_items WHERE postId = ?').run(post.postId);
      t.sqlite.prepare('DELETE FROM posts WHERE postId = ?').run(post.postId);
      return Result.ok({ uri: 'at://did:plc:abc/app.bsky.feed.post/3kmid', cid: 'bafymid', rkey: '3kmid' });
    };
    t.behavior.deleteRecord = () => Result.err(failure('deleteRecord failed: status 503'));

    await t.flush();

    expect(await t.row(post.postId)).toMatchObject({
      status: 'deleting',
      uri: 'at://did:plc:abc/app.bsky.feed.post/3kmid',
      cid: 'bafymid',
      rkey: '3kmid',
      attempts: 1,
      lastError: 'deleteRecord failed: status 503',
    });

    t.behavior.deleteRecord = () => Result.ok(undefined);
    t.sqlite.prepare('UPDATE bluesky_crossposts SET createdAt = 0 WHERE postId = ?').run(post.postId);
    const summary = await run(t.retry.run());

    expect(summary).toMatchObject({ deleted: 1, deleteFailed: 0 });
    expect(t.deleted).toEqual(['3kmid', '3kmid']);
    expect(await t.row(post.postId)).toBeUndefined();
  });

  it('retry は attempts が 5 未満の deleting の行に deleteRecord を再試行し、成功したら行を消す', async () => {
    const t = setup();
    const post = t.addPost();
    insertDeleting(t, post.postId, 2);

    const summary = await run(t.retry.run());

    expect(summary).toMatchObject({ deleted: 1, deleteFailed: 0, sent: 0 });
    expect(t.deleted).toEqual(['3kdel']);
    expect(await t.row(post.postId)).toBeUndefined();
  });

  it('再試行の deleteRecord が失敗したら deleting のまま attempts を増やし、5 回で止める', async () => {
    const t = setup();
    const post = t.addPost();
    insertDeleting(t, post.postId, 3);
    t.behavior.deleteRecord = () => Result.err(failure('deleteRecord failed: status 500'));

    expect(await run(t.retry.run())).toMatchObject({ deleted: 0, deleteFailed: 1 });
    expect(await t.row(post.postId)).toMatchObject({ status: 'deleting', attempts: 4 });
    expect(await run(t.retry.run())).toMatchObject({ deleteFailed: 1 });
    expect(await t.row(post.postId)).toMatchObject({ status: 'deleting', attempts: 5 });
    expect(await run(t.retry.run())).toMatchObject({ deleted: 0, deleteFailed: 0 });
    expect(t.deleted).toEqual(['3kdel', '3kdel']);
  });

  it('send は deleting の行には触れない', async () => {
    const t = setup();
    const post = t.addPost();
    insertDeleting(t, post.postId, 1);

    expect(await run(t.send.run({ postId: post.postId }))).toBe('noop');
    expect(t.rkeys).toEqual([]);
    expect(await t.row(post.postId)).toMatchObject({ status: 'deleting', attempts: 1 });
  });

  it('削除は sent から deleting を経て、削除済みなら行が消える', async () => {
    const t = setup();
    const post = t.addPost();
    await run(t.schedule.run({ postId: post.postId }));
    await t.flush();
    t.behavior.deleteRecord = () => Result.err(failure('deleteRecord failed: status 500'));
    await run(t.remove.run({ postId: post.postId }));
    await t.flush();
    expect(await t.row(post.postId)).toMatchObject({ status: 'deleting', attempts: 1 });

    t.behavior.deleteRecord = () => Result.ok(undefined);
    t.sqlite.prepare('UPDATE bluesky_crossposts SET createdAt = 0').run();
    await run(t.retry.run());

    expect(await t.row(post.postId)).toBeUndefined();
  });
});

describe('スレッドの 2 件目以降', () => {
  const insertRow = (
    t: ReturnType<typeof setup>,
    postId: string,
    status: 'pending' | 'failed',
    attempts: number,
    createdAt: number,
  ) =>
    t.sqlite.prepare(
      'INSERT INTO bluesky_crossposts(postId,status,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?)',
    ).run(postId, status, attempts, createdAt, createdAt);

  it.each(
    [
      ['pending', 0],
      ['failed', 2],
    ] as const,
  )('親が %s (attempts %i) なら、子は skipped にせず pending に置く', async (status, attempts) => {
    const t = setup();
    const parent = t.addPost({ content: '<p>親</p>' });
    insertRow(t, parent.postId, status, attempts, NOW);
    const child = t.addPost({ content: '<p>子</p>', inReplyToUri: parent.uri });

    expect(await run(t.schedule.run({ postId: child.postId }))).toBe('pending');

    expect(await t.row(child.postId)).toMatchObject({ status: 'pending', skipReason: null, attempts: 0 });
  });

  it('親が上限に達した failed なら、子は reply_to_unsent で skipped にする', async () => {
    const t = setup();
    const parent = t.addPost({ content: '<p>親</p>' });
    insertRow(t, parent.postId, 'failed', 3, NOW);
    const child = t.addPost({ content: '<p>子</p>', inReplyToUri: parent.uri });

    expect(await run(t.schedule.run({ postId: child.postId }))).toBe('skipped');

    expect(await t.row(child.postId)).toMatchObject({ status: 'skipped', skipReason: 'reply_to_unsent' });
  });

  it('親がまだ送られていない間、send は子を pending のまま、attempts を増やさず何もしない', async () => {
    const t = setup();
    const parent = t.addPost({ content: '<p>親</p>' });
    insertRow(t, parent.postId, 'pending', 0, NOW);
    const child = t.addPost({ content: '<p>子</p>', inReplyToUri: parent.uri });
    await run(t.schedule.run({ postId: child.postId }));

    await t.flush();

    expect(await t.row(child.postId)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(t.rkeys).toEqual([]);
  });

  it('send の時点で親が skipped なら、子は reply_to_unsent で skipped にする', async () => {
    const t = setup();
    const parent = t.addPost({ content: '<p>親</p>' });
    insertRow(t, parent.postId, 'pending', 0, NOW);
    const child = t.addPost({ content: '<p>子</p>', inReplyToUri: parent.uri });
    await run(t.schedule.run({ postId: child.postId }));
    t.sqlite.prepare('UPDATE bluesky_crossposts SET status = \'skipped\' WHERE postId = ?').run(parent.postId);

    await t.flush();

    expect(await t.row(child.postId)).toMatchObject({ status: 'skipped', skipReason: 'reply_to_unsent' });
  });

  it('retry は古い順に処理するので、親が送られた同じ回で子も親への返信として送られる', async () => {
    const t = setup();
    const parent = t.addPost({ content: '<p>親</p>' });
    const child = t.addPost({ content: '<p>子</p>', inReplyToUri: parent.uri });
    const grandchild = t.addPost({ content: '<p>孫</p>', inReplyToUri: child.uri });
    insertRow(t, parent.postId, 'pending', 0, NOW - 90 * 60_000);
    insertRow(t, child.postId, 'pending', 0, NOW - 80 * 60_000);
    insertRow(t, grandchild.postId, 'pending', 0, NOW - 70 * 60_000);

    const summary = await run(t.retry.run());

    expect(summary).toMatchObject({ sent: 3, noop: 0 });
    const parentRef = { uri: 'at://did:plc:abc/app.bsky.feed.post/3k0', cid: 'bafycid0' };
    expect(t.created[1]?.reply).toEqual({ root: parentRef, parent: parentRef });
    expect(t.created[2]?.reply).toEqual({
      root: parentRef,
      parent: { uri: 'at://did:plc:abc/app.bsky.feed.post/3k1', cid: 'bafycid1' },
    });
    expect(await t.row(child.postId)).toMatchObject({ status: 'sent', attempts: 1, rootUri: parentRef.uri });
  });

  it('親の送信が終わる前に子を予約しても、親の送信後に retry で子が送られる', async () => {
    const t = setup();
    const parent = t.addPost({ content: '<p>親</p>' });
    insertRow(t, parent.postId, 'pending', 0, NOW);
    const child = t.addPost({ content: '<p>子</p>', inReplyToUri: parent.uri });
    await run(t.schedule.run({ postId: child.postId }));
    await t.flush();
    expect(await t.row(child.postId)).toMatchObject({ status: 'pending', attempts: 0 });

    await run(t.send.run({ postId: parent.postId }));
    t.sqlite.prepare('UPDATE bluesky_crossposts SET createdAt = ? WHERE postId = ?').run(
      NOW - 60 * 60_000,
      child.postId,
    );
    await run(t.retry.run());

    expect(await t.row(child.postId)).toMatchObject({ status: 'sent', attempts: 1 });
    expect(t.created[1]?.reply).toBeDefined();
  });
});

describe('createBlueskyThumbnailFetcher', () => {
  const fetcherFor = (response: Response | Error) =>
    createBlueskyThumbnailFetcher({
      fetch: vi.fn(async () => {
        if (response instanceof Error) throw response;
        return response;
      }) as unknown as typeof fetch,
    });
  const image = (size: number, type = 'image/png') =>
    new Response(new Uint8Array(size), { status: 200, headers: { 'content-type': type } });

  it('画像を取得して bytes と mimeType を返す', async () => {
    expect(await fetcherFor(image(10, 'image/jpeg; charset=binary')).fetch('https://example.com/a.jpg')).toEqual({
      bytes: new Uint8Array(10),
      mimeType: 'image/jpeg',
    });
  });

  it.each([
    ['1,000,000 bytes を超える', image(1_000_001)],
    ['画像でない', new Response('x', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['404', new Response('x', { status: 404, headers: { 'content-type': 'image/png' } })],
    ['接続できない', new Error('network')],
  ])('%s ときは undefined を返す', async (_name, response) => {
    expect(await fetcherFor(response).fetch('https://example.com/a.png')).toBeUndefined();
  });

  it('リダイレクトを追わず、3xx は thumb なしとして扱う', async () => {
    const fetchStub = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/a.png', 'content-type': 'image/png' } })
    );
    const fetcher = createBlueskyThumbnailFetcher({ fetch: fetchStub as unknown as typeof fetch });

    expect(await fetcher.fetch('https://example.com/a.png')).toBeUndefined();
    expect(fetchStub).toHaveBeenCalledWith(
      'https://example.com/a.png',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it.each(['http://example.com/a.png', 'https://localhost/a.png', 'https://127.0.0.1/a.png', 'not a url'])(
    '%s は取得しない',
    async (url) => {
      const fetchStub = vi.fn();
      const fetcher = createBlueskyThumbnailFetcher({ fetch: fetchStub as unknown as typeof fetch });
      expect(await fetcher.fetch(url)).toBeUndefined();
      expect(fetchStub).not.toHaveBeenCalled();
    },
  );
});
