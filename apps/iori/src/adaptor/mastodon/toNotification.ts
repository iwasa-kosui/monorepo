import type { ActorId } from '../../domain/actor/actorId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type {
  BlueskyNotification,
  BlueskyNotificationAuthor,
  Notification as DomainNotification,
} from '../../domain/notification/notification.ts';
import type { PostId } from '../../domain/post/postId.ts';
import { blueskyPostUrlOfUri } from '../../helper/blueskyUrl.ts';
import {
  type Account,
  IORI_EMOJI_REACTION_TYPE,
  type IoriNotificationExtension,
  type Notification,
  NotificationTypeSchema,
  type Status,
} from './entities.ts';
import { toIsoString } from './time.ts';
import { blueskyProfileUrlOf } from './toBlueskyAccount.ts';

export type ToNotificationOptions = Readonly<{
  createdAt: Instant;
  account: Account;
  status: Status | null;
}>;

export type ResponseNotificationType = Notification['type'];

export const toType = (notification: DomainNotification): ResponseNotificationType => {
  switch (notification.type) {
    case 'like':
      return 'favourite';
    case 'reply':
      return 'mention';
    case 'follow':
      return 'follow';
    case 'emojiReact':
      return IORI_EMOJI_REACTION_TYPE;
    case 'repost':
      return 'reblog';
    case 'blueskyLike':
      return 'favourite';
    case 'blueskyRepost':
      return 'reblog';
    case 'blueskyFollow':
      return 'follow';
    case 'blueskyMention':
      return 'mention';
  }
};

export type NotificationTrigger =
  | Readonly<{ kind: 'actor'; actorId: ActorId }>
  | Readonly<{ kind: 'bluesky'; author: BlueskyNotificationAuthor }>;

export const triggerOf = (notification: DomainNotification): NotificationTrigger => {
  switch (notification.type) {
    case 'like':
      return { kind: 'actor', actorId: notification.likerActorId };
    case 'reply':
      return { kind: 'actor', actorId: notification.replierActorId };
    case 'follow':
      return { kind: 'actor', actorId: notification.followerActorId };
    case 'emojiReact':
      return { kind: 'actor', actorId: notification.reactorActorId };
    case 'repost':
      return { kind: 'actor', actorId: notification.reposterActorId };
    case 'blueskyLike':
    case 'blueskyRepost':
    case 'blueskyFollow':
    case 'blueskyMention':
      return { kind: 'bluesky', author: notification.author };
  }
};

export const targetPostIdOf = (notification: DomainNotification): PostId | undefined => {
  switch (notification.type) {
    case 'like':
      return notification.likedPostId;
    case 'reply':
      return notification.replyPostId;
    case 'follow':
      return undefined;
    case 'emojiReact':
      return notification.reactedPostId;
    case 'repost':
      return notification.repostedPostId;
    case 'blueskyLike':
    case 'blueskyRepost':
      return notification.targetPostId ?? undefined;
    case 'blueskyMention':
    case 'blueskyFollow':
      return undefined;
  }
};

const BLUESKY_POST_COLLECTION = '/app.bsky.feed.post/';

const blueskyPostUrlOf = (uri: string): string | undefined =>
  uri.includes(BLUESKY_POST_COLLECTION) ? blueskyPostUrlOfUri(uri) : undefined;

export const blueskyExtensionOf = (
  notification: BlueskyNotification,
): NonNullable<IoriNotificationExtension['bluesky']> => {
  const profileUrl = blueskyProfileUrlOf(notification.author);
  switch (notification.type) {
    case 'blueskyLike':
      return { reason: 'like', url: blueskyPostUrlOf(notification.subjectUri) ?? profileUrl };
    case 'blueskyRepost':
      return { reason: 'repost', url: blueskyPostUrlOf(notification.subjectUri) ?? profileUrl };
    case 'blueskyFollow':
      return { reason: 'follow', url: profileUrl };
    case 'blueskyMention':
      return {
        reason: notification.reason,
        url: blueskyPostUrlOf(notification.blueskyUri) ?? profileUrl,
        text: notification.text,
      };
  }
};

export const toExtension = (notification: DomainNotification): IoriNotificationExtension | undefined => {
  switch (notification.type) {
    case 'emojiReact':
      return { emoji: notification.emoji, url: notification.emojiImageUrl };
    case 'blueskyLike':
    case 'blueskyRepost':
    case 'blueskyFollow':
    case 'blueskyMention':
      return { bluesky: blueskyExtensionOf(notification) };
    default:
      return undefined;
  }
};

const domainTypesOf: Readonly<Record<ResponseNotificationType, ReadonlyArray<DomainNotification['type']>>> = {
  favourite: ['like', 'blueskyLike'],
  mention: ['reply', 'blueskyMention'],
  follow: ['follow', 'blueskyFollow'],
  [IORI_EMOJI_REACTION_TYPE]: ['emojiReact'],
  status: [],
  reblog: ['repost', 'blueskyRepost'],
  follow_request: [],
  poll: [],
  update: [],
  'admin.sign_up': [],
  'admin.report': [],
  severed_relationships: [],
  moderation_warning: [],
};

const knownTypes = new Set<string>([...NotificationTypeSchema.options, IORI_EMOJI_REACTION_TYPE]);
const defaultTypes: ReadonlyArray<ResponseNotificationType> = ['favourite', 'mention', 'follow', 'reblog'];

const known = (values: ReadonlyArray<string>): ResponseNotificationType[] =>
  values.filter((value): value is ResponseNotificationType => knownTypes.has(value));

export const selectDomainTypes = (
  query: Readonly<{ types: ReadonlyArray<string>; excludeTypes: ReadonlyArray<string> }>,
): DomainNotification['type'][] => {
  const requested = known(query.types);
  const excluded = new Set(known(query.excludeTypes));
  return (requested.length === 0 ? defaultTypes : requested)
    .filter((type) => !excluded.has(type))
    .flatMap((type) => domainTypesOf[type]);
};

// 公式 iOS クライアントは Int でデコードするため、作成時刻と ID の先頭 10 bit から通知の新しさの順に並ぶ整数を作る
export const toGroupedNotificationId = (notificationId: string, createdAtMs: number): number =>
  createdAtMs * 1024 + (Number.parseInt(notificationId.slice(0, 3), 16) >> 2);

// 同じミリ秒で先頭 10 bit が一致した通知の値が重ならないように、狭義の降順にそろえる
export const toStrictlyDescending = (values: ReadonlyArray<number>): number[] =>
  values.reduce<number[]>((result, value) => {
    const previous = result.at(-1);
    result.push(previous === undefined || value < previous ? value : previous - 1);
    return result;
  }, []);

export const toNotification = (
  notification: DomainNotification,
  options: ToNotificationOptions,
): Notification => {
  const iori = toExtension(notification);
  return {
    id: notification.notificationId,
    type: toType(notification),
    created_at: toIsoString(options.createdAt),
    account: options.account,
    ...(options.status === null ? {} : { status: options.status }),
    ...(iori === undefined ? {} : { iori }),
  };
};
