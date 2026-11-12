import { describe, expect, it } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { BlueskyCrosspost } from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { ImageId } from '../../domain/image/imageId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import { LinkPreviewId } from '../../domain/linkPreview/linkPreviewId.ts';
import type { LocalPost, PostWithAuthor, RemotePost } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { RepostId } from '../../domain/repost/repostId.ts';
import type { RepostTimelineItem } from '../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../domain/timeline/timelineItemId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { type Account, AccountSchema, StatusSchema } from './entities.ts';
import { toAccount } from './toAccount.ts';
import { toIoriBlueskyCrosspost, toReblogStatus, toStatus } from './toStatus.ts';

const createdAt = Date.UTC(2025, 0, 2, 3, 4, 5) as Instant;
const authorActorId = ActorId.generate();

const account: Account = toAccount(
  {
    type: 'local',
    user: { id: UserId.generate(), username: Username.orThrow('kosui') },
    actor: {
      id: authorActorId,
      userId: UserId.generate(),
      type: 'local',
      uri: 'https://iori.example/users/kosui',
      inboxUrl: 'https://iori.example/users/kosui/inbox',
    },
  },
  {
    baseUrl: 'https://iori.example/api/v1/timelines/home',
    defaultAvatarUrl: 'https://iori.example/static/avatar.png',
    defaultHeaderUrl: 'https://iori.example/static/header.png',
    followersCount: 0,
    followingCount: 0,
    statusesCount: 0,
    createdAt,
    lastStatusAt: null,
  },
);

const author = {
  username: Username.orThrow('kosui'),
  logoUri: undefined,
  liked: true,
  reposted: false,
  images: [{ imageId: ImageId.generate(), url: 'https://iori.example/uploads/a.png', altText: 'alt' }, {
    imageId: ImageId.generate(),
    url: 'https://iori.example/uploads/b.png',
    altText: null,
  }],
  likeCount: 4,
  repostCount: 2,
  reactions: [
    { emoji: ':blobcat:', count: 3, emojiImageUrl: 'https://iori.example/emoji/blobcat.png' },
    { emoji: '🎉', count: 1, emojiImageUrl: null },
  ],
  linkPreviews: [
    {
      linkPreviewId: LinkPreviewId.generate(),
      postId: PostId.generate(),
      url: 'https://example.com/a',
      title: 'Title A',
      description: null,
      imageUrl: 'https://example.com/a.png',
      faviconUrl: 'https://example.com/favicon.ico',
      siteName: 'Example',
      createdAt,
    },
    {
      linkPreviewId: LinkPreviewId.generate(),
      postId: PostId.generate(),
      url: 'https://example.com/b',
      title: null,
      description: 'Desc B',
      imageUrl: null,
      faviconUrl: null,
      siteName: null,
      createdAt,
    },
  ],
} satisfies Omit<PostWithAuthor, keyof LocalPost>;

const localPost: PostWithAuthor = {
  ...author,
  type: 'local',
  visibility: 'public',
  summary: null,
  sensitive: false,
  postId: PostId.generate(),
  actorId: authorActorId,
  content: '<p>hello</p>',
  createdAt,
  userId: UserId.generate(),
  inReplyToUri: null,
};

const remotePost: PostWithAuthor = {
  ...author,
  type: 'remote',
  summary: null,
  sensitive: false,
  postId: PostId.generate(),
  actorId: authorActorId,
  content: '<p>remote</p>',
  createdAt,
  uri: 'https://remote.example/users/alice/statuses/1',
  inReplyToUri: null,
  visibility: 'public',
} satisfies RemotePost & typeof author;

const options = {
  baseUrl: 'https://iori.example/api/v1/timelines/home',
  account,
  mediaAttachmentIds: ['media-1', 'media-2'],
  repliesCount: 5,
  inReplyToId: 'parent-id',
  inReplyToAccountId: 'parent-account-id',
  myReactionEmojis: new Set(['🎉']),
};

describe('toStatus', () => {
  it('converts a local post into a Status that passes the schema', () => {
    const status = toStatus(localPost, options);

    expect(StatusSchema.safeParse(status).success).toBe(true);
    expect(status).toMatchObject({
      id: localPost.postId,
      uri: `https://iori.example/users/kosui/posts/${localPost.postId}`,
      url: `https://iori.example/users/kosui/posts/${localPost.postId}`,
      created_at: '2025-01-02T03:04:05.000Z',
      content: '<p>hello</p>',
      visibility: 'public',
      sensitive: false,
      spoiler_text: '',
      mentions: [],
      tags: [],
      emojis: [],
      favourited: true,
      reblogged: false,
      favourites_count: 4,
      reblogs_count: 2,
      replies_count: 5,
      in_reply_to_id: 'parent-id',
      in_reply_to_account_id: 'parent-account-id',
      reblog: null,
    });
    expect(status.account).toEqual(account);
  });

  it.each([
    ['<p></p>', null],
    ['<p>   </p>', null],
    ['<p>こんにちは</p>', 'ja'],
    ['<p>カタカナ</p>', 'ja'],
    ['<p>漢字 日本</p>', 'und'],
    ['<p>hello</p>', 'und'],
  ])('sets language for %s to %s', (content, expected) => {
    expect(toStatus({ ...localPost, content }, options).language).toBe(expected);
  });

  it('uses the URI of a remote post', () => {
    const status = toStatus(remotePost, options);

    expect(StatusSchema.safeParse(status).success).toBe(true);
    expect(status.uri).toBe('https://remote.example/users/alice/statuses/1');
  });

  it('puts the summary and sensitive flag of a remote post into spoiler_text and sensitive', () => {
    const status = toStatus({ ...remotePost, summary: 'ネタバレ注意', sensitive: true }, options);

    expect(StatusSchema.safeParse(status).success).toBe(true);
    expect(status.spoiler_text).toBe('ネタバレ注意');
    expect(status.sensitive).toBe(true);
  });

  it('keeps sensitive true when the post has no summary', () => {
    const status = toStatus({ ...remotePost, summary: null, sensitive: true }, options);

    expect(status.spoiler_text).toBe('');
    expect(status.sensitive).toBe(true);
  });

  it('uses public for a local post', () => {
    expect(toStatus(localPost, options).visibility).toBe('public');
  });

  it.each(['public', 'unlisted', 'private'] as const)(
    'uses the stored visibility %s of a local post',
    (visibility) => {
      expect(toStatus({ ...localPost, visibility } as PostWithAuthor, options).visibility).toBe(visibility);
    },
  );

  it.each(['public', 'unlisted', 'private', 'direct'] as const)(
    'uses the recorded visibility %s of a remote post',
    (visibility) => {
      expect(toStatus({ ...remotePost, visibility } as PostWithAuthor, options).visibility).toBe(visibility);
    },
  );

  it('uses private for a remote post without a recorded visibility', () => {
    expect(toStatus({ ...remotePost, visibility: null } as PostWithAuthor, options).visibility).toBe('private');
  });

  it('converts images into media attachments with the given ids', () => {
    const status = toStatus(localPost, options);

    expect(status.media_attachments).toEqual([
      {
        id: 'media-1',
        type: 'image',
        url: 'https://iori.example/uploads/a.png',
        preview_url: 'https://iori.example/uploads/a.png',
        remote_url: null,
        meta: null,
        description: 'alt',
        blurhash: null,
      },
      {
        id: 'media-2',
        type: 'image',
        url: 'https://iori.example/uploads/b.png',
        preview_url: 'https://iori.example/uploads/b.png',
        remote_url: null,
        meta: null,
        description: null,
        blurhash: null,
      },
    ]);
  });

  it('uses the first link preview as card and puts every preview into iori.link_previews', () => {
    const status = toStatus(localPost, options);

    expect(status.card).toMatchObject({
      url: 'https://example.com/a',
      title: 'Title A',
      description: '',
      type: 'link',
      provider_name: 'Example',
      image: 'https://example.com/a.png',
    });
    expect(status.iori?.link_previews).toEqual([
      {
        url: 'https://example.com/a',
        title: 'Title A',
        description: null,
        image: 'https://example.com/a.png',
        site_name: 'Example',
        favicon: 'https://example.com/favicon.ico',
      },
      { url: 'https://example.com/b', title: null, description: 'Desc B', image: null, site_name: null, favicon: null },
    ]);
  });

  it('puts reactions into iori.reactions and marks only the given emojis as mine', () => {
    const status = toStatus(localPost, options);

    expect(status.iori?.reactions).toEqual([
      { emoji: ':blobcat:', count: 3, url: 'https://iori.example/emoji/blobcat.png', me: false },
      { emoji: '🎉', count: 1, url: null, me: true },
    ]);
  });

  it('returns a null card when the post has no link preview', () => {
    const status = toStatus({ ...localPost, linkPreviews: [] }, options);

    expect(status.card).toBeNull();
    expect(StatusSchema.safeParse(status).success).toBe(true);
  });
});

describe('toStatus quote', () => {
  const quotedStatus = toStatus(remotePost, options);
  const quoteUri = 'https://remote.example/users/alice/statuses/1';

  it('is null and has no quote_url for a post without a quote', () => {
    const status = toStatus(localPost, options);

    expect(status.quote).toBeNull();
    expect(status.iori).not.toHaveProperty('quote_url');
    expect(StatusSchema.safeParse(status).success).toBe(true);
  });

  it('is null and has no quote_url when the quote option is null', () => {
    const status = toStatus(localPost, { ...options, quote: null });

    expect(status.quote).toBeNull();
    expect(status.iori).not.toHaveProperty('quote_url');
  });

  it('carries the quoted Status as an accepted quote and omits quote_url', () => {
    const status = toStatus(localPost, { ...options, quote: { uri: quoteUri, status: quotedStatus } });

    expect(StatusSchema.safeParse(status).success).toBe(true);
    expect(status.quote).toEqual({ state: 'accepted', quoted_status: quotedStatus });
    expect(status.iori).not.toHaveProperty('quote_url');
  });

  it('rejects a quote whose state is not accepted', () => {
    const status = toStatus(localPost, { ...options, quote: { uri: quoteUri, status: quotedStatus } });

    expect(StatusSchema.safeParse({ ...status, quote: { state: 'pending', quoted_status: quotedStatus } }).success)
      .toBe(false);
    expect(StatusSchema.safeParse({ ...status, quote: { state: 'accepted' } }).success).toBe(false);
  });

  it('keeps quote null inside the quoted Status', () => {
    const status = toStatus(localPost, { ...options, quote: { uri: quoteUri, status: quotedStatus } });

    expect(status.quote?.quoted_status.quote).toBeNull();
  });

  it('is null and puts the received URI in iori.quote_url when the quoted post cannot be resolved', () => {
    const status = toStatus(localPost, { ...options, quote: { uri: quoteUri, status: null } });

    expect(StatusSchema.safeParse(status).success).toBe(true);
    expect(status.quote).toBeNull();
    expect(status.iori?.quote_url).toBe(quoteUri);
  });

  it('omits quote_url when the received URI is not http or https', () => {
    const status = toStatus(localPost, { ...options, quote: { uri: 'javascript:alert(1)', status: null } });

    expect(status.quote).toBeNull();
    expect(status.iori).not.toHaveProperty('quote_url');
  });

  it('keeps the quote of a boosted Status inside reblog and sets quote to null on the boost', () => {
    const status = toStatus(localPost, { ...options, quote: { uri: quoteUri, status: quotedStatus } });

    const boost = toReblogStatus({ createdAt: Date.UTC(2025, 1, 3) as Instant }, {
      repostId: RepostId.generate(),
      account: { ...account, id: ActorId.generate() },
      reblog: status,
    });

    expect(StatusSchema.safeParse(boost).success).toBe(true);
    expect(boost.quote).toBeNull();
    expect(boost.reblog?.quote).toEqual({ state: 'accepted', quoted_status: quotedStatus });
  });

  it('keeps quote_url of a boosted Status whose quote is unresolved inside reblog', () => {
    const status = toStatus(localPost, { ...options, quote: { uri: quoteUri, status: null } });

    const boost = toReblogStatus({ createdAt: Date.UTC(2025, 1, 3) as Instant }, {
      repostId: RepostId.generate(),
      account: { ...account, id: ActorId.generate() },
      reblog: status,
    });

    expect(boost.reblog?.iori?.quote_url).toBe(quoteUri);
  });
});

describe('toStatus content sanitization', () => {
  it('sanitizes the content of the status and of the status it boosts', () => {
    const dirty = { ...localPost, content: '<p>hi<script>alert(1)</script><img src=x onerror=alert(1)></p>' };

    const status = toStatus(dirty, options);
    const reposterActorId = ActorId.generate();
    const repostId = RepostId.generate();
    const boost = toReblogStatus({ createdAt: Date.UTC(2025, 1, 3) as Instant }, {
      repostId,
      account: { ...account, id: reposterActorId },
      reblog: status,
    });

    expect(status.content).toBe('<p>hi</p>');
    expect(boost.reblog?.content).toBe('<p>hi</p>');
  });
});

describe('toStatus url safety', () => {
  const unsafe = 'javascript:alert(1)';

  it('turns a relative upload path into an absolute url', () => {
    const post: PostWithAuthor = {
      ...localPost,
      images: [{ imageId: ImageId.generate(), url: '/uploads/a.png', altText: null }],
    };

    const status = toStatus(post, { ...options, mediaAttachmentIds: ['media-1'] });

    expect(status.media_attachments[0]).toMatchObject({
      url: 'https://iori.example/uploads/a.png',
      preview_url: 'https://iori.example/uploads/a.png',
    });
  });

  it.each([
    { mediaType: 'video/mp4', url: 'https://remote.example/media/1.mp4', type: 'video', preview: null },
    { mediaType: 'audio/mpeg', url: 'https://remote.example/media/1.mp3', type: 'audio', preview: null },
    {
      mediaType: 'image/png',
      url: 'https://remote.example/media/1.png',
      type: 'image',
      preview: 'https://remote.example/media/1.png',
    },
    { mediaType: null, url: 'https://remote.example/media/1.webm', type: 'video', preview: null },
    { mediaType: null, url: 'https://remote.example/media/1.ogg', type: 'audio', preview: null },
    {
      mediaType: null,
      url: 'https://remote.example/media/1.jpg',
      type: 'image',
      preview: 'https://remote.example/media/1.jpg',
    },
  ])('decides the media attachment type $type from mediaType $mediaType and the url', (
    { mediaType, url, type, preview },
  ) => {
    const post: PostWithAuthor = {
      ...localPost,
      images: [{ imageId: ImageId.generate(), url, altText: 'alt', mediaType }],
    };

    const status = toStatus(post, { ...options, mediaAttachmentIds: ['media-1'] });

    expect(status.media_attachments).toEqual([{
      id: 'media-1',
      type,
      url,
      preview_url: preview,
      remote_url: null,
      meta: null,
      description: 'alt',
      blurhash: null,
    }]);
    expect(StatusSchema.safeParse(status).success).toBe(true);
  });

  it('drops a media attachment whose url is not http or https', () => {
    const post: PostWithAuthor = {
      ...localPost,
      images: [
        { imageId: ImageId.generate(), url: unsafe, altText: null },
        { imageId: ImageId.generate(), url: 'https://iori.example/uploads/b.png', altText: null },
      ],
    };

    const status = toStatus(post, options);

    expect(status.media_attachments.map((attachment) => attachment.id)).toEqual(['media-2']);
  });

  it('uses a null card and drops link previews when the url is unsafe, and nulls unsafe images', () => {
    const [first, second] = localPost.linkPreviews;
    const post: PostWithAuthor = {
      ...localPost,
      linkPreviews: [
        { ...first!, url: unsafe },
        { ...second!, url: 'https://example.com/b', imageUrl: unsafe, faviconUrl: unsafe },
      ],
    };

    const status = toStatus(post, options);

    expect(status.card).toBeNull();
    expect(status.iori?.link_previews).toEqual([
      {
        url: 'https://example.com/b',
        title: null,
        description: 'Desc B',
        image: null,
        site_name: null,
        favicon: null,
      },
    ]);
  });

  it('nulls the image of a card and the url of a reaction when they are unsafe', () => {
    const post: PostWithAuthor = {
      ...localPost,
      linkPreviews: [{ ...localPost.linkPreviews[0]!, imageUrl: unsafe }],
      reactions: [{ emoji: ':x:', count: 1, emojiImageUrl: unsafe }],
    };

    const status = toStatus(post, options);

    expect(status.card?.image).toBeNull();
    expect(status.iori?.reactions).toEqual([{ emoji: ':x:', count: 1, url: null, me: false }]);
  });

  it('keeps the uri of a remote post and sets url to null when the uri is unsafe', () => {
    const status = toStatus({ ...remotePost, uri: unsafe } as PostWithAuthor, options);

    expect(status.url).toBeNull();
    expect(status.uri).toBe(`https://iori.example/api/v1/statuses/${remotePost.postId}`);
    expect(StatusSchema.safeParse(status).success).toBe(true);
  });
});

describe('toReblogStatus', () => {
  it('wraps the original Status with the repost id and the reposter account', () => {
    const reposterActorId = ActorId.generate();
    const reposter: Account = { ...account, id: reposterActorId, username: 'alice', acct: 'alice@remote.example' };
    const reblog = toStatus(localPost, options);
    const repostId = RepostId.generate();
    const item: RepostTimelineItem = {
      type: 'repost',
      timelineItemId: TimelineItemId.generate(),
      repostId,
      post: localPost,
      repostedBy: { actorId: reposterActorId, username: 'alice', logoUri: undefined },
      createdAt: Date.UTC(2025, 1, 3) as Instant,
    };

    const status = toReblogStatus(item, { repostId, account: reposter, reblog });

    expect(StatusSchema.safeParse(status).success).toBe(true);
    expect(AccountSchema.safeParse(status.account).success).toBe(true);
    expect(status.id).toBe(repostId);
    expect(status.created_at).toBe('2025-02-03T00:00:00.000Z');
    expect(status.account.id).toBe(reposterActorId);
    expect(status.reblog).toEqual(reblog);
    expect(status.content).toBe('');
    expect(status.favourited).toBe(true);
    expect(status.language).toBe(reblog.language);
  });
});

describe('toIoriBlueskyCrosspost', () => {
  const crosspost = (overrides: Partial<BlueskyCrosspost>): BlueskyCrosspost => ({
    postId: localPost.postId,
    status: 'pending',
    skipReason: null,
    uri: null,
    cid: null,
    rkey: null,
    rootUri: null,
    rootCid: null,
    attempts: 0,
    lastError: null,
    createdAt: 0 as Instant,
    updatedAt: 0 as Instant,
    ...overrides,
  });

  it('sent で uri があれば bsky.app の投稿の URL にする', () => {
    expect(toIoriBlueskyCrosspost(crosspost({ status: 'sent', uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz' })))
      .toEqual({
        status: 'sent',
        skip_reason: null,
        retrying: false,
        url: 'https://bsky.app/profile/did:plc:abc/post/3kxyz',
      });
  });

  it('sent 以外では uri があっても URL を出さない', () => {
    expect(
      toIoriBlueskyCrosspost(crosspost({ status: 'failed', uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz' })).url,
    )
      .toBeNull();
  });

  it('retrying は canRetry の結果にする', () => {
    expect(toIoriBlueskyCrosspost(crosspost({ status: 'failed', attempts: 3 })).retrying).toBe(false);
    expect(toIoriBlueskyCrosspost(crosspost({ status: 'failed', attempts: 2 })).retrying).toBe(true);
  });

  it('toStatus は blueskyCrosspost を渡したときだけ iori に載せる', () => {
    expect(toStatus(localPost, options).iori?.bluesky_crosspost).toBeUndefined();
    expect(toStatus(localPost, { ...options, blueskyCrosspost: null }).iori?.bluesky_crosspost).toBeUndefined();
    expect(toStatus(localPost, { ...options, blueskyCrosspost: crosspost({}) }).iori?.bluesky_crosspost)
      .toMatchObject({ status: 'pending' });
  });
});
