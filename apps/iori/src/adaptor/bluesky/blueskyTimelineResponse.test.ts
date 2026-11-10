import { describe, expect, it } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import { parseBlueskyTimelineResponse } from './blueskyTimelineResponse.ts';

const FETCHED_AT = Instant.orThrow(Date.UTC(2026, 10, 8, 12));
const DID = 'did:plc:author';
const URI = `at://${DID}/app.bsky.feed.post/3kabc`;

const postView = (overrides: Record<string, unknown> = {}, record: Record<string, unknown> = {}) => ({
  uri: URI,
  cid: 'bafycid',
  author: { did: DID, handle: 'alice.bsky.social', displayName: 'Alice', avatar: 'https://cdn.example/avatar.jpg' },
  record: {
    $type: 'app.bsky.feed.post',
    text: 'こんにちは',
    createdAt: '2026-11-08T01:00:00.000Z',
    ...record,
  },
  indexedAt: '2026-11-08T01:00:05.000Z',
  ...overrides,
});
const parse = (feed: unknown[], cursor?: string) =>
  parseBlueskyTimelineResponse({ feed, ...(cursor === undefined ? {} : { cursor }) }, FETCHED_AT);
const only = (feed: unknown[]) => {
  const parsed = parse(feed);
  if (!parsed.ok) throw new Error('unexpected failure');
  expect(parsed.val.items).toHaveLength(1);
  return parsed.val.items[0]!;
};

describe('parseBlueskyTimelineResponse', () => {
  it('通常の投稿を、feedItemId を uri にして表示用の形に変換する', () => {
    const parsed = parse([{ post: postView() }], 'next-cursor');

    expect(parsed).toEqual({
      ok: true,
      val: {
        cursor: 'next-cursor',
        dropped: 0,
        items: [{
          feedItemId: URI,
          uri: URI,
          cid: 'bafycid',
          authorDid: DID,
          authorHandle: 'alice.bsky.social',
          authorDisplayName: 'Alice',
          authorAvatar: 'https://cdn.example/avatar.jpg',
          text: 'こんにちは',
          facets: [],
          embed: null,
          replyParentUri: null,
          replyParentAuthorHandle: null,
          repostedByDid: null,
          repostedByHandle: null,
          postedAt: Date.UTC(2026, 10, 8, 1),
          indexedAt: Date.UTC(2026, 10, 8, 1, 0, 5),
          fetchedAt: FETCHED_AT,
          liked: false,
          viewerLikeUri: null,
          reposted: false,
          viewerRepostUri: null,
        }],
      },
    });
  });

  it('post.viewer.like があれば viewerLikeUri に入れて liked にする', () => {
    const likeUri = 'at://did:plc:me/app.bsky.feed.like/3klike';

    const item = only([{ post: postView({ viewer: { like: likeUri } }) }]);

    expect(item).toMatchObject({ liked: true, viewerLikeUri: likeUri });
  });

  it.each([
    ['viewer が無い', {}],
    ['viewer.like が無い', { viewer: { repost: 'at://did:plc:me/app.bsky.feed.repost/3k' } }],
    ['viewer.like が like の uri でない', { viewer: { like: 'not-an-at-uri' } }],
  ])('%s ときは liked にしない', (_name, overrides) => {
    expect(only([{ post: postView(overrides) }])).toMatchObject({ liked: false, viewerLikeUri: null });
  });

  it('post.viewer.repost があれば viewerRepostUri に入れて reposted にする', () => {
    const repostUri = 'at://did:plc:me/app.bsky.feed.repost/3krepost';

    const item = only([{ post: postView({ viewer: { repost: repostUri } }) }]);

    expect(item).toMatchObject({ reposted: true, viewerRepostUri: repostUri, liked: false, viewerLikeUri: null });
  });

  it.each([
    ['viewer が無い', {}],
    ['viewer.repost が無い', { viewer: { like: 'at://did:plc:me/app.bsky.feed.like/3k' } }],
    ['viewer.repost が repost の uri でない', { viewer: { repost: 'at://did:plc:me/app.bsky.feed.like/3k' } }],
  ])('%s ときは reposted にしない', (_name, overrides) => {
    expect(only([{ post: postView(overrides) }])).toMatchObject({ reposted: false, viewerRepostUri: null });
  });

  it('リポスト行でも、uri と cid は元の投稿のものにし、viewer.repost を読む', () => {
    const repostUri = 'at://did:plc:me/app.bsky.feed.repost/3krepost';

    const item = only([{
      post: postView({ viewer: { repost: repostUri } }),
      reason: {
        $type: 'app.bsky.feed.defs#reasonRepost',
        by: { did: 'did:plc:b', handle: 'bob.example' },
        indexedAt: '2026-11-08T02:00:00.000Z',
      },
    }]);

    expect(item).toMatchObject({
      feedItemId: `${URI}#repost:did:plc:b`,
      uri: URI,
      cid: 'bafycid',
      repostedByDid: 'did:plc:b',
      reposted: true,
      viewerRepostUri: repostUri,
    });
  });

  it('リポストは feedItemId にリポストした人の DID を付け、indexedAt に reason の時刻を使う', () => {
    const item = only([{
      post: postView(),
      reason: {
        $type: 'app.bsky.feed.defs#reasonRepost',
        by: { did: 'did:plc:bob', handle: 'bob.bsky.social' },
        indexedAt: '2026-11-08T03:00:00.000Z',
      },
    }]);

    expect(item.feedItemId).toBe(`${URI}#repost:did:plc:bob`);
    expect(item.uri).toBe(URI);
    expect(item.repostedByDid).toBe('did:plc:bob');
    expect(item.repostedByHandle).toBe('bob.bsky.social');
    expect(item.indexedAt).toBe(Date.UTC(2026, 10, 8, 3));
    expect(item.postedAt).toBe(Date.UTC(2026, 10, 8, 1));
  });

  it('リポスト以外の reason は通常の投稿として扱う', () => {
    const item = only([{ post: postView(), reason: { $type: 'app.bsky.feed.defs#reasonPin' } }]);

    expect(item.feedItemId).toBe(URI);
    expect(item.repostedByDid).toBeNull();
  });

  it('壊れたリポストの reason は、その 1 件を捨てる', () => {
    const parsed = parse([{ post: postView(), reason: { $type: 'app.bsky.feed.defs#reasonRepost' } }]);

    expect(parsed).toMatchObject({ ok: true, val: { items: [], dropped: 1 } });
  });

  it('返信は親の uri と、取れれば親の handle を残す', () => {
    const parentUri = `at://did:plc:parent/app.bsky.feed.post/3kparent`;
    const withParent = only([{
      post: postView({}, { reply: { parent: { uri: parentUri, cid: 'c' }, root: { uri: parentUri, cid: 'c' } } }),
      reply: { parent: { author: { did: 'did:plc:parent', handle: 'carol.bsky.social' } } },
    }]);
    const blockedParent = only([{
      post: postView({}, { reply: { parent: { uri: parentUri, cid: 'c' }, root: { uri: parentUri, cid: 'c' } } }),
      reply: { parent: { $type: 'app.bsky.feed.defs#notFoundPost', uri: parentUri, notFound: true } },
    }]);

    expect(withParent).toMatchObject({ replyParentUri: parentUri, replyParentAuthorHandle: 'carol.bsky.social' });
    expect(blockedParent).toMatchObject({ replyParentUri: parentUri, replyParentAuthorHandle: null });
  });

  it('facets は link・mention・tag だけ表示用の形にし、未知の feature や壊れた facet は捨てる', () => {
    const item = only([{
      post: postView({}, {
        facets: [
          {
            index: { byteStart: 0, byteEnd: 3 },
            features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' }],
          },
          {
            index: { byteStart: 4, byteEnd: 8 },
            features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:m' }],
          },
          {
            index: { byteStart: 9, byteEnd: 12 },
            features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'iori' }],
          },
          { index: { byteStart: 13, byteEnd: 14 }, features: [{ $type: 'app.bsky.richtext.facet#unknown' }] },
          { index: { byteStart: 'x' }, features: [] },
        ],
      }),
    }]);

    expect(item.facets).toEqual([
      { byteStart: 0, byteEnd: 3, feature: { type: 'link', uri: 'https://example.com' } },
      { byteStart: 4, byteEnd: 8, feature: { type: 'mention', did: 'did:plc:m' } },
      { byteStart: 9, byteEnd: 12, feature: { type: 'tag', tag: 'iori' } },
    ]);
  });

  it('byte 範囲が不正な facet だけを捨て、投稿は残す', () => {
    const feature = [{ $type: 'app.bsky.richtext.facet#tag', tag: 'iori' }];
    const item = only([{
      post: postView({}, {
        facets: [
          { index: { byteStart: 1.5, byteEnd: 4 }, features: feature },
          { index: { byteStart: -1, byteEnd: 4 }, features: feature },
          { index: { byteStart: 5, byteEnd: 4 }, features: feature },
          { index: { byteStart: 0, byteEnd: 2.5 }, features: feature },
          { index: { byteStart: 2, byteEnd: 2 }, features: feature },
        ],
      }),
    }]);

    expect(item.facets).toEqual([{ byteStart: 2, byteEnd: 2, feature: { type: 'tag', tag: 'iori' } }]);
  });

  describe('embed', () => {
    const embedOf = (embed: unknown) => only([{ post: postView({ embed }) }]).embed;
    const viewRecord = {
      $type: 'app.bsky.embed.record#viewRecord',
      uri: 'at://did:plc:q/app.bsky.feed.post/3kq',
      cid: 'c',
      author: { did: 'did:plc:q', handle: 'quote.bsky.social', displayName: 'Q' },
      value: { $type: 'app.bsky.feed.post', text: '引用された投稿', createdAt: '2026-11-07T00:00:00.000Z' },
      embeds: [],
    };
    const imagesView = {
      $type: 'app.bsky.embed.images#view',
      images: [
        { thumb: 'https://cdn.example/t1.jpg', fullsize: 'https://cdn.example/f1.jpg', alt: '猫' },
        { thumb: 'https://cdn.example/t2.jpg', fullsize: 'https://cdn.example/f2.jpg' },
      ],
    };
    const externalView = {
      $type: 'app.bsky.embed.external#view',
      external: {
        uri: 'https://example.com/article',
        title: '記事',
        description: '説明',
        thumb: 'https://cdn.example/card.jpg',
      },
    };
    const videoView = {
      $type: 'app.bsky.embed.video#view',
      cid: 'vc',
      playlist: 'https://video.example/playlist.m3u8',
      thumbnail: 'https://video.example/thumb.jpg',
      aspectRatio: { width: 16, height: 9 },
    };

    it('images を thumb・fullsize・alt に整える（alt が無ければ空文字）', () => {
      expect(embedOf(imagesView)).toEqual({
        type: 'images',
        images: [
          { thumb: 'https://cdn.example/t1.jpg', fullsize: 'https://cdn.example/f1.jpg', alt: '猫' },
          { thumb: 'https://cdn.example/t2.jpg', fullsize: 'https://cdn.example/f2.jpg', alt: '' },
        ],
      });
    });

    it('external を uri・title・description・thumb に整える', () => {
      expect(embedOf(externalView)).toEqual({
        type: 'external',
        uri: 'https://example.com/article',
        title: '記事',
        description: '説明',
        thumb: 'https://cdn.example/card.jpg',
      });
      expect(embedOf({ ...externalView, external: { uri: 'https://example.com/a' } })).toEqual({
        type: 'external',
        uri: 'https://example.com/a',
        title: '',
        description: '',
        thumb: null,
      });
    });

    it('record（引用）を uri・handle・本文だけにする', () => {
      expect(embedOf({ $type: 'app.bsky.embed.record#view', record: viewRecord })).toEqual({
        type: 'record',
        uri: 'at://did:plc:q/app.bsky.feed.post/3kq',
        authorHandle: 'quote.bsky.social',
        text: '引用された投稿',
      });
    });

    it('引用先が削除済み・ブロック済みなら embed を持たない', () => {
      expect(embedOf({
        $type: 'app.bsky.embed.record#view',
        record: { $type: 'app.bsky.embed.record#viewNotFound', uri: viewRecord.uri, notFound: true },
      })).toBeNull();
    });

    it('recordWithMedia を media と record に分ける', () => {
      expect(embedOf({
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: { $type: 'app.bsky.embed.record#view', record: viewRecord },
        media: imagesView,
      })).toMatchObject({
        type: 'recordWithMedia',
        media: { type: 'images' },
        record: { type: 'record', authorHandle: 'quote.bsky.social' },
      });
    });

    it('recordWithMedia の引用先が読めなければ media だけ残す', () => {
      expect(embedOf({
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: { $type: 'app.bsky.embed.record#view', record: { $type: 'app.bsky.embed.record#viewBlocked' } },
        media: externalView,
      })).toMatchObject({ type: 'external' });
    });

    it('video を thumbnail と playlist の URL だけにする', () => {
      expect(embedOf(videoView)).toEqual({
        type: 'video',
        thumbnail: 'https://video.example/thumb.jpg',
        playlist: 'https://video.example/playlist.m3u8',
      });
    });

    it('未知の型と http/https 以外の URL を含む embed は捨てる', () => {
      expect(embedOf({ $type: 'app.bsky.embed.unknown#view', foo: 'bar' })).toBeNull();
      expect(embedOf({ ...externalView, external: { ...externalView.external, uri: 'javascript:alert(1)' } }))
        .toBeNull();
      expect(embedOf({ ...imagesView, images: [{ thumb: 'data:text/html,x', fullsize: 'https://a.example/f.jpg' }] }))
        .toBeNull();
    });
  });

  it('http/https 以外のアバター URL は捨てて、投稿は残す', () => {
    const item = only([{
      post: postView({ author: { did: DID, handle: 'alice.bsky.social', avatar: 'javascript:alert(1)' } }),
    }]);

    expect(item.authorAvatar).toBeNull();
    expect(item.authorDisplayName).toBeNull();
  });

  it('壊れた 1 件（投稿以外の record、不正な日時、必須項目の欠落）を捨てて続ける', () => {
    const parsed = parse([
      { post: postView() },
      { post: postView({}, { $type: 'app.bsky.graph.list' }) },
      { post: postView({ uri: `${URI}2` }, { createdAt: 'not-a-date' }) },
      { post: { uri: 'at://x' } },
      'garbage',
      { post: postView({ uri: `${URI}3` }) },
    ]);

    expect(parsed.ok && parsed.val.items.map((item) => item.uri)).toEqual([URI, `${URI}3`]);
    expect(parsed.ok && parsed.val.dropped).toBe(4);
  });

  it('feed が配列でない応答は失敗にする', () => {
    expect(parseBlueskyTimelineResponse({ feed: 'nope' }, FETCHED_AT)).toEqual({ ok: false, err: 'invalid_response' });
    expect(parseBlueskyTimelineResponse(null, FETCHED_AT)).toEqual({ ok: false, err: 'invalid_response' });
  });
});
