import { describe, expect, it } from 'vitest';

import type { Instant } from '../../domain/instant/instant.ts';
import type {
  BlueskyLikeNotification,
  BlueskyLikeViaRepostNotification,
  BlueskyMentionNotification,
  BlueskyRepostViaRepostNotification,
} from '../../domain/notification/notification.ts';
import { NotificationId } from '../../domain/notification/notificationId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { type Account, StatusSchema } from './entities.ts';
import { toBlueskyAccount } from './toBlueskyAccount.ts';
import { toBlueskyStatus } from './toBlueskyStatus.ts';

const createdAt = Date.UTC(2025, 0, 2, 3, 4, 5) as Instant;
const author = { did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: null, avatarUrl: null };
const account: Account = toBlueskyAccount(author, {
  defaultAvatarUrl: 'https://iori.example/default-avatar.png',
  defaultHeaderUrl: 'https://iori.example/default-header.png',
});
const base = {
  notificationId: NotificationId.generate(),
  recipientUserId: UserId.generate(),
  isRead: false,
  author,
};
const subjectUri = 'at://did:plc:me/app.bsky.feed.post/3kpost';

const like = (overrides: Partial<BlueskyLikeNotification> = {}): BlueskyLikeNotification => ({
  ...base,
  type: 'blueskyLike',
  blueskyUri: 'at://did:plc:alice/app.bsky.feed.like/3k1',
  subjectUri,
  targetPostId: null,
  ...overrides,
});

const mention = (overrides: Partial<BlueskyMentionNotification> = {}): BlueskyMentionNotification => ({
  ...base,
  type: 'blueskyMention',
  blueskyUri: 'at://did:plc:alice/app.bsky.feed.post/3kreply',
  reason: 'reply',
  subjectUri,
  targetPostId: null,
  text: 'hello',
  ...overrides,
});

describe('toBlueskyStatus', () => {
  it('blueskyLike は対象の投稿の AT-URI を id にし、本文を空にして Status の必須項目を満たす', () => {
    const status = toBlueskyStatus(like(), { createdAt, account });

    expect(StatusSchema.safeParse(status).success).toBe(true);
    expect(status).toMatchObject({
      id: `bluesky:${subjectUri}`,
      uri: 'https://bsky.app/profile/did:plc:me/post/3kpost',
      url: 'https://bsky.app/profile/did:plc:me/post/3kpost',
      created_at: '2025-01-02T03:04:05.000Z',
      content: '',
      visibility: 'public',
      account: { id: 'bluesky:did:plc:alice' },
      media_attachments: [],
      reblogs_count: 0,
      in_reply_to_id: null,
      reblog: null,
    });
  });

  it('blueskyLikeViaRepost と blueskyRepostViaRepost は元の投稿の AT-URI を id にし、本文を空にする', () => {
    const original = 'at://did:plc:other/app.bsky.feed.post/3korig';
    const likeViaRepost: BlueskyLikeViaRepostNotification = {
      ...base,
      type: 'blueskyLikeViaRepost',
      blueskyUri: 'at://did:plc:alice/app.bsky.feed.like/3k3',
      subjectUri: original,
      targetPostId: null,
    };
    const repostViaRepost: BlueskyRepostViaRepostNotification = {
      ...base,
      type: 'blueskyRepostViaRepost',
      blueskyUri: 'at://did:plc:alice/app.bsky.feed.repost/3k4',
      subjectUri: original,
      targetPostId: null,
    };

    for (const notification of [likeViaRepost, repostViaRepost]) {
      const status = toBlueskyStatus(notification, { createdAt, account });

      expect(StatusSchema.safeParse(status).success).toBe(true);
      expect(status).toMatchObject({
        id: `bluesky:${original}`,
        url: 'https://bsky.app/profile/did:plc:other/post/3korig',
        content: '',
      });
    }
  });

  it('対象が投稿でないときは相手のプロフィールを URL にする', () => {
    const status = toBlueskyStatus(
      like({ subjectUri: 'at://did:plc:me/app.bsky.graph.starterpack/3kpack' }),
      { createdAt, account },
    );

    expect(status.url).toBe('https://bsky.app/profile/alice.bsky.social');
    expect(status.uri).toBe('https://bsky.app/profile/alice.bsky.social');
  });

  it('blueskyMention は通知自身の AT-URI を id にし、本文を段落で包む', () => {
    const status = toBlueskyStatus(mention(), { createdAt, account });

    expect(StatusSchema.safeParse(status).success).toBe(true);
    expect(status).toMatchObject({
      id: 'bluesky:at://did:plc:alice/app.bsky.feed.post/3kreply',
      url: 'https://bsky.app/profile/did:plc:alice/post/3kreply',
      content: '<p>hello</p>',
    });
  });

  it('blueskyMention の本文の HTML をエスケープし、改行を <br> にする', () => {
    const status = toBlueskyStatus(mention({ text: '<script>alert(1)</script> & "q"\nnext' }), { createdAt, account });

    expect(status.content).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;<br>next</p>');
  });
});
