import type { ActorId } from '../../domain/actor/actorId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { Notification as DomainNotification } from '../../domain/notification/notification.ts';
import type { PostId } from '../../domain/post/postId.ts';
import {
  type Account,
  IORI_EMOJI_REACTION_TYPE,
  type IoriNotificationExtension,
  type Notification,
  NotificationTypeSchema,
  type Status,
} from './entities.ts';
import { toIsoString } from './time.ts';

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
  }
};

export const triggerActorIdOf = (notification: DomainNotification): ActorId => {
  switch (notification.type) {
    case 'like':
      return notification.likerActorId;
    case 'reply':
      return notification.replierActorId;
    case 'follow':
      return notification.followerActorId;
    case 'emojiReact':
      return notification.reactorActorId;
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
  }
};

export const toExtension = (notification: DomainNotification): IoriNotificationExtension | undefined =>
  notification.type === 'emojiReact'
    ? { emoji: notification.emoji, url: notification.emojiImageUrl }
    : undefined;

const domainTypesOf: Readonly<Record<ResponseNotificationType, ReadonlyArray<DomainNotification['type']>>> = {
  favourite: ['like'],
  mention: ['reply'],
  follow: ['follow'],
  [IORI_EMOJI_REACTION_TYPE]: ['emojiReact'],
  status: [],
  reblog: [],
  follow_request: [],
  poll: [],
  update: [],
  'admin.sign_up': [],
  'admin.report': [],
  severed_relationships: [],
  moderation_warning: [],
};

const knownTypes = new Set<string>([...NotificationTypeSchema.options, IORI_EMOJI_REACTION_TYPE]);
const defaultTypes: ReadonlyArray<ResponseNotificationType> = ['favourite', 'mention', 'follow'];

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
