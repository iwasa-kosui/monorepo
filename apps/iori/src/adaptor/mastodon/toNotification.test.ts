import { describe, expect, it } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { Notification } from '../../domain/notification/notification.ts';
import { NotificationId } from '../../domain/notification/notificationId.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { type Account, NotificationSchema, RelationshipSchema } from './entities.ts';
import { toNotification } from './toNotification.ts';
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
  });

  it('maps follow to follow without a status', () => {
    const result = toNotification({ ...base, type: 'follow', followerActorId: ActorId.generate() }, options);

    expect(NotificationSchema.safeParse(result).success).toBe(true);
    expect(result?.type).toBe('follow');
    expect(result).not.toHaveProperty('status');
  });

  it('returns undefined for emojiReact', () => {
    const result = toNotification({
      ...base,
      type: 'emojiReact',
      reactorActorId: ActorId.generate(),
      reactedPostId: PostId.generate(),
      emoji: '🎉',
      emojiImageUrl: null,
    }, options);

    expect(result).toBeUndefined();
  });
});

describe('toRelationship', () => {
  it('sets the given flags and leaves the others false', () => {
    const relationship = toRelationship({ id: account.id, following: true, followedBy: false, muting: true });

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
