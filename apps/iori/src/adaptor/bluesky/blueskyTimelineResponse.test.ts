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
  it('record.bridgyOriginalUrl を bridgyOriginalUrl に入れる', () => {
    const item = only([{ post: postView({}, { bridgyOriginalUrl: 'https://mastodon.example/@alice/123' }) }]);

    expect(item.bridgyOriginalUrl).toBe('https://mastodon.example/@alice/123');
  });

  it.each([
    ['http 以外のスキーム', 'javascript:alert(1)'],
    ['URL でない文字列', 'not a url'],
    ['空文字', ''],
  ])('record.bridgyOriginalUrl が%sなら null にする', (_label, bridgyOriginalUrl) => {
    expect(only([{ post: postView({}, { bridgyOriginalUrl }) }]).bridgyOriginalUrl).toBeNull();
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

  it('post.viewer.bookmarked が true なら bookmarked にする', () => {
    expect(only([{ post: postView({ viewer: { bookmarked: true } }) }])).toMatchObject({ bookmarked: true });
  });

  it.each([
    ['viewer が無い', {}],
    ['viewer.bookmarked が無い', { viewer: { like: 'at://did:plc:me/app.bsky.feed.like/3k' } }],
  ])('%s ときは bookmarkUnknown にする', (_name, overrides) => {
    expect(only([{ post: postView(overrides) }])).toMatchObject({ bookmarked: false, bookmarkUnknown: true });
  });

  it.each([true, false])('viewer.bookmarked が %s のときは bookmarkUnknown にしない', (bookmarked) => {
    expect(only([{ post: postView({ viewer: { bookmarked } }) }])).not.toHaveProperty('bookmarkUnknown');
  });

  it('返信の record.reply.root.uri を replyRootUri に入れる', () => {
    const parentUri = 'at://did:plc:parent/app.bsky.feed.post/3kparent';
    const rootUri = 'at://did:plc:root/app.bsky.feed.post/3kroot';
    const item = only([{
      post: postView({}, { reply: { parent: { uri: parentUri, cid: 'c' }, root: { uri: rootUri, cid: 'c' } } }),
    }]);

    expect(item).toMatchObject({ replyParentUri: parentUri, replyRootUri: rootUri });
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
      alt: '走る猫',
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

    it('record の項目が足りなければ、読めた項目だけにする', () => {
      expect(embedOf({
        $type: 'app.bsky.embed.record#view',
        record: {
          uri: viewRecord.uri,
          author: { handle: 'quote.bsky.social', displayName: '', avatar: 'javascript:alert(1)' },
          value: { text: '本文' },
        },
      })).toEqual({
        type: 'record',
        uri: viewRecord.uri,
        authorHandle: 'quote.bsky.social',
        text: '本文',
      });
    });

    it('引用先の embeds[0] が images・external・video なら media に取り出す', () => {
      const mediaOfQuote = (quoteEmbed: unknown) =>
        embedOf({ $type: 'app.bsky.embed.record#view', record: { ...viewRecord, embeds: [quoteEmbed] } }) as {
          media?: unknown;
        };

      expect(mediaOfQuote(imagesView).media).toEqual({
        type: 'images',
        images: [
          { thumb: 'https://cdn.example/t1.jpg', fullsize: 'https://cdn.example/f1.jpg', alt: '猫' },
          { thumb: 'https://cdn.example/t2.jpg', fullsize: 'https://cdn.example/f2.jpg', alt: '' },
        ],
      });
      expect(mediaOfQuote(externalView).media).toMatchObject({ type: 'external', uri: 'https://example.com/article' });
      expect(mediaOfQuote(videoView).media).toMatchObject({
        type: 'video',
        playlist: 'https://video.example/playlist.m3u8',
      });
    });

    it('引用先の中の引用や読めない media は持たず、引用は残す', () => {
      const quoteWith = (quoteEmbed: unknown) =>
        embedOf({ $type: 'app.bsky.embed.record#view', record: { ...viewRecord, embeds: [quoteEmbed] } });
      const nested = quoteWith({
        $type: 'app.bsky.embed.record#view',
        record: { ...viewRecord, uri: 'at://did:plc:n/app.bsky.feed.post/3kn' },
      });
      const broken = quoteWith({
        ...imagesView,
        images: [{ thumb: 'data:text/html,x', fullsize: 'https://a.example/f.jpg' }],
      });

      expect(nested).toMatchObject({ type: 'record', uri: viewRecord.uri });
      expect(nested).not.toHaveProperty('media', expect.anything());
      expect(broken).toMatchObject({ type: 'record', uri: viewRecord.uri });
      expect(broken).not.toHaveProperty('media', expect.anything());
    });

    it('引用先の embeds[0] が recordWithMedia なら、その media を取り出し、入れ子の引用は持たない', () => {
      const quote = embedOf({
        $type: 'app.bsky.embed.record#view',
        record: {
          ...viewRecord,
          embeds: [{
            $type: 'app.bsky.embed.recordWithMedia#view',
            record: {
              $type: 'app.bsky.embed.record#view',
              record: { ...viewRecord, uri: 'at://did:plc:n/app.bsky.feed.post/3kn' },
            },
            media: imagesView,
          }],
        },
      });

      expect(quote).toMatchObject({ type: 'record', uri: viewRecord.uri, media: { type: 'images' } });
      expect(quote).not.toHaveProperty('record');
    });

    it.each([
      ['app.bsky.embed.record#viewNotFound', 'notFound'],
      ['app.bsky.embed.record#viewBlocked', 'blocked'],
      ['app.bsky.embed.record#viewDetached', 'detached'],
    ])('引用先が %s なら recordUnavailable（%s）にする', (viewType, reason) => {
      expect(embedOf({
        $type: 'app.bsky.embed.record#view',
        record: { $type: viewType, uri: viewRecord.uri },
      })).toEqual({ type: 'recordUnavailable', uri: viewRecord.uri, reason });
    });

    it('引用先の $type が未知、または uri が無ければ embed を持たない', () => {
      expect(embedOf({
        $type: 'app.bsky.embed.record#view',
        record: { $type: 'app.bsky.feed.defs#generatorView', uri: viewRecord.uri },
      })).toBeNull();
      expect(embedOf({
        $type: 'app.bsky.embed.record#view',
        record: { $type: 'app.bsky.embed.record#viewNotFound' },
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

    it.each([
      ['app.bsky.embed.record#viewNotFound', 'notFound'],
      ['app.bsky.embed.record#viewBlocked', 'blocked'],
      ['app.bsky.embed.record#viewDetached', 'detached'],
    ])('recordWithMedia の引用先が %s なら、media と recordUnavailable（%s）を持つ', (viewType, reason) => {
      expect(embedOf({
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: { $type: 'app.bsky.embed.record#view', record: { $type: viewType, uri: viewRecord.uri } },
        media: externalView,
      })).toEqual({
        type: 'recordWithMedia',
        media: {
          type: 'external',
          uri: 'https://example.com/article',
          title: '記事',
          description: '説明',
          thumb: 'https://cdn.example/card.jpg',
        },
        record: { type: 'recordUnavailable', uri: viewRecord.uri, reason },
      });
    });

    it('recordWithMedia の引用先が uri も無く読めなければ media だけ残す', () => {
      expect(embedOf({
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: { $type: 'app.bsky.embed.record#view', record: { $type: 'app.bsky.embed.record#viewBlocked' } },
        media: externalView,
      })).toMatchObject({ type: 'external' });
    });

    it('video の aspectRatio と alt が無い・不正・空なら null にする', () => {
      const bare = { $type: videoView.$type, playlist: videoView.playlist };
      expect(embedOf(bare)).toEqual({
        type: 'video',
        thumbnail: null,
        playlist: 'https://video.example/playlist.m3u8',
        aspectRatio: null,
        alt: null,
      });
      expect(embedOf({ ...videoView, aspectRatio: { width: 0, height: 9 }, alt: '' })).toMatchObject({
        thumbnail: 'https://video.example/thumb.jpg',
        aspectRatio: null,
        alt: null,
      });
      expect(embedOf({ ...videoView, aspectRatio: { width: 1.5, height: 9 }, alt: 3 })).toMatchObject({
        aspectRatio: null,
        alt: null,
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
