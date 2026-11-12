import { describe, expect, it } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { Notification } from '../../domain/notification/notification.ts';
import { NotificationId } from '../../domain/notification/notificationId.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { type Account, NotificationSchema, RelationshipSchema } from './entities.ts';
import {
  selectDomainTypes,
  targetPostIdOf,
  toGroupedNotificationId,
  toNotification,
  toStrictlyDescending,
  triggerOf,
} from './toNotification.ts';
import { toRelationship } from './toRelationship.ts';

const createdAt = Date.UTC(2025, 0, 2, 3, 4, 5) as Instant;
const account: Account = {
  id: ActorId.generate(),
  username: 'alice',
  acct: 'alice@remote.example',
  url: 'https://remote.example/@alice',
  uri: 'https://remote.example/users/alice',
  display_name: 'alice',
  note: '',
  avatar: 'https://iori.example/static/avatar.png',
  avatar_static: 'https://iori.example/static/avatar.png',
  header: 'https://iori.example/static/header.png',
  header_static: 'https://iori.example/static/header.png',
  locked: false,
  fields: [],
  emojis: [],
  bot: false,
  group: false,
  discoverable: null,
  indexable: false,
  hide_collections: null,
  created_at: '2025-01-01T00:00:00.000Z',
  last_status_at: null,
  statuses_count: 0,
  followers_count: 0,
  following_count: 0,
};

const base = { notificationId: NotificationId.generate(), recipientUserId: UserId.generate(), isRead: false };
const options = { createdAt, account, status: null };

describe('toNotification', () => {
  it('maps like to favourite', () => {
    const notification: Notification = {
      ...base,
      type: 'like',
      likerActorId: account.id as ActorId,
      likedPostId: PostId.generate(),
    };

    const result = toNotification(notification, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      id: notification.notificationId,
      type: 'favourite',
      created_at: '2025-01-02T03:04:05.000Z',
    });
  });

  it('maps reply to mention', () => {
    const result = toNotification({
      ...base,
      type: 'reply',
      replierActorId: ActorId.generate(),
      replyPostId: PostId.generate(),
      originalPostId: PostId.generate(),
    }, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result?.type).toBe('mention');
    expect(result.iori).toEqual({ fediverse: { reason: 'reply' } });
  });

  it('maps repost to reblog with the reposter and the reposted post', () => {
    const reposterActorId = ActorId.generate();
    const repostedPostId = PostId.generate();
    const notification: Notification = { ...base, type: 'repost', reposterActorId, repostedPostId };

    const result = toNotification(notification, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ id: notification.notificationId, type: 'reblog' });
    expect(result).not.toHaveProperty('iori');
    expect(triggerOf(notification)).toEqual({ kind: 'actor', actorId: reposterActorId });
    expect(targetPostIdOf(notification)).toBe(repostedPostId);
  });

  it('maps mention to mention with the mentioner and the mentioning post', () => {
    const mentionerActorId = ActorId.generate();
    const mentionPostId = PostId.generate();
    const notification: Notification = { ...base, type: 'mention', mentionerActorId, mentionPostId };

    const result = toNotification(notification, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ id: notification.notificationId, type: 'mention' });
    expect(result.iori).toEqual({ fediverse: { reason: 'mention' } });
    expect(triggerOf(notification)).toEqual({ kind: 'actor', actorId: mentionerActorId });
    expect(targetPostIdOf(notification)).toBe(mentionPostId);
  });

  it('maps follow to follow without a status', () => {
    const result = toNotification({ ...base, type: 'follow', followerActorId: ActorId.generate() }, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result?.type).toBe('follow');
    expect(result).not.toHaveProperty('status');
  });

  it('maps emojiReact to iori:emoji_reaction with the emoji in the iori extension', () => {
    const result = toNotification({
      ...base,
      type: 'emojiReact',
      reactorActorId: ActorId.generate(),
      reactedPostId: PostId.generate(),
      emoji: ':wave:',
      emojiImageUrl: 'https://iori.example/emoji/wave.png',
    }, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      type: 'iori:emoji_reaction',
      iori: { emoji: ':wave:', url: 'https://iori.example/emoji/wave.png' },
    });
  });

  it('omits the iori extension for the other types', () => {
    const result = toNotification({ ...base, type: 'follow', followerActorId: ActorId.generate() }, options);

    expect(result).not.toHaveProperty('iori');
  });
});

describe('Bluesky notifications', () => {
  const author = { did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: null, avatarUrl: null };
  const blueskyBase = { ...base, blueskyUri: 'at://did:plc:alice/app.bsky.feed.like/3k1', author };
  const subjectUri = 'at://did:plc:me/app.bsky.feed.post/3kpost';

  it('maps blueskyLike to favourite with a link to the liked post', () => {
    const targetPostId = PostId.generate();
    const notification: Notification = { ...blueskyBase, type: 'blueskyLike', subjectUri, targetPostId };

    const result = toNotification(notification, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      type: 'favourite',
      iori: { bluesky: { reason: 'like', url: 'https://bsky.app/profile/did:plc:me/post/3kpost', uri: subjectUri } },
    });
    expect(triggerOf(notification)).toEqual({ kind: 'bluesky', author });
    expect(targetPostIdOf(notification)).toBe(targetPostId);
  });

  it('maps blueskyRepost to reblog and has no target post when it is not matched', () => {
    const notification: Notification = { ...blueskyBase, type: 'blueskyRepost', subjectUri, targetPostId: null };

    const result = toNotification(notification, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result.type).toBe('reblog');
    expect(result.iori?.bluesky).toEqual({
      reason: 'repost',
      url: 'https://bsky.app/profile/did:plc:me/post/3kpost',
      uri: subjectUri,
    });
    expect(targetPostIdOf(notification)).toBeUndefined();
  });

  it('maps blueskyFollow to follow with a link to the profile', () => {
    const notification: Notification = { ...blueskyBase, type: 'blueskyFollow' };

    const result = toNotification(notification, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      type: 'follow',
      iori: { bluesky: { reason: 'follow', url: 'https://bsky.app/profile/alice.bsky.social' } },
    });
    expect(result.iori?.bluesky).not.toHaveProperty('uri');
    expect(targetPostIdOf(notification)).toBeUndefined();
  });

  it('maps blueskyMention to mention with the text and a link to the notification post itself', () => {
    const notification: Notification = {
      ...blueskyBase,
      blueskyUri: 'at://did:plc:alice/app.bsky.feed.post/3kreply',
      type: 'blueskyMention',
      reason: 'reply',
      subjectUri,
      targetPostId: PostId.generate(),
      text: 'hello',
    };

    const result = toNotification(notification, options);
    expect(targetPostIdOf(notification)).toBeUndefined();

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      type: 'mention',
      iori: {
        bluesky: {
          reason: 'reply',
          url: 'https://bsky.app/profile/did:plc:alice/post/3kreply',
          uri: 'at://did:plc:alice/app.bsky.feed.post/3kreply',
          text: 'hello',
        },
      },
    });
  });

  it('links a notification from a handle.invalid author to the profile by did', () => {
    const result = toNotification({
      ...blueskyBase,
      type: 'blueskyFollow',
      author: { ...author, handle: 'handle.invalid' },
    }, options);

    expect(result.iori?.bluesky?.url).toBe('https://bsky.app/profile/did:plc:alice');
  });

  it('falls back to the profile when the subject is not a post', () => {
    const result = toNotification({
      ...blueskyBase,
      type: 'blueskyLike',
      subjectUri: 'at://did:plc:me/app.bsky.graph.starterpack/3kpack',
      targetPostId: null,
    }, options);

    expect(result.iori?.bluesky?.url).toBe('https://bsky.app/profile/alice.bsky.social');
    expect(result.iori?.bluesky).not.toHaveProperty('uri');
  });

  it('does not set uri for a post uri that the post endpoints would reject', () => {
    const result = toNotification({
      ...blueskyBase,
      type: 'blueskyLike',
      subjectUri: 'at://did:plc:me/app.bsky.feed.post/3kpost#repost:did:plc:bob',
      targetPostId: null,
    }, options);

    expect(result.iori?.bluesky).not.toHaveProperty('uri');
  });
});

describe('selectDomainTypes', () => {
  const select = (types: string[], excludeTypes: string[] = []) => selectDomainTypes({ types, excludeTypes });

  it('returns like, reply, mention, follow and repost by default and leaves emojiReact out', () => {
    expect(select([])).toEqual([
      'like',
      'blueskyLike',
      'reply',
      'mention',
      'blueskyMention',
      'follow',
      'blueskyFollow',
      'repost',
      'blueskyRepost',
    ]);
  });

  it('returns emojiReact only when iori:emoji_reaction is named', () => {
    expect(select(['iori:emoji_reaction'])).toEqual(['emojiReact']);
    expect(select(['favourite', 'iori:emoji_reaction'])).toEqual(['like', 'blueskyLike', 'emojiReact']);
  });

  it('ignores unknown values and applies the exclusions', () => {
    expect(select(['bogus'])).toEqual(select([]));
    expect(select(['favourite', 'bogus'])).toEqual(['like', 'blueskyLike']);
    expect(select([], ['follow', 'bogus'])).toEqual([
      'like',
      'blueskyLike',
      'reply',
      'mention',
      'blueskyMention',
      'repost',
      'blueskyRepost',
    ]);
    expect(select(['reblog'])).toEqual(['repost', 'blueskyRepost']);
    expect(select(['status'])).toEqual([]);
  });
});

describe('toGroupedNotificationId', () => {
  const id = (prefix: string) => `${prefix}00000-0000-4000-8000-000000000000`;

  it('is larger for a notification created later', () => {
    expect(toGroupedNotificationId(id('fff'), 1_000)).toBeLessThan(toGroupedNotificationId(id('000'), 1_001));
  });

  it('follows the order of the uuid within the same millisecond', () => {
    const low = toGroupedNotificationId(id('1a2'), 5_000);
    const high = toGroupedNotificationId(id('1a8'), 5_000);

    expect(low).not.toBe(high);
    expect(high).toBeGreaterThan(low);
  });

  it('stays a safe integer for the current time and the largest uuid prefix', () => {
    const result = toGroupedNotificationId(id('fff'), Date.now());

    expect(Number.isSafeInteger(result)).toBe(true);
  });
});

describe('toStrictlyDescending', () => {
  it('keeps values that already descend strictly', () => {
    expect(toStrictlyDescending([30, 20, 10])).toEqual([30, 20, 10]);
  });

  it('lowers a value that equals or exceeds the previous one to the previous value minus one', () => {
    expect(toStrictlyDescending([10, 10, 12, 5])).toEqual([10, 9, 8, 5]);
  });

  it('cascades through a run of equal values and returns an empty array for no values', () => {
    expect(toStrictlyDescending([7, 7, 7, 7])).toEqual([7, 6, 5, 4]);
    expect(toStrictlyDescending([])).toEqual([]);
  });
});

describe('toRelationship', () => {
  it('sets the given flags and leaves the others false', () => {
    const relationship = toRelationship({
      id: account.id,
      following: true,
      followedBy: false,
      muting: true,
      blocking: false,
    });

    expect(RelationshipSchema.safeParse(relationship).success).toBe(true);
    expect(relationship).toMatchObject({
      id: account.id,
      following: true,
      followed_by: false,
      muting: true,
      requested: false,
      blocking: false,
      blocked_by: false,
      domain_blocking: false,
      endorsed: false,
    });
  });
});
