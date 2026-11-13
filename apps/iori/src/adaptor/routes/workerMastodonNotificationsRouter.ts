import { type Context, Hono } from 'hono';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type {
  Notification as DomainNotification,
  NotificationCountResolverSinceMarker,
  NotificationItem,
  NotificationResolverByUserIdAndId,
  NotificationsResolverByPage,
} from '../../domain/notification/notification.ts';
import { NotificationId } from '../../domain/notification/notificationId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PostsWithAuthorResolverByPostIds } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { blueskyDidOfUri } from '../../helper/blueskyUrl.ts';
import type { ClearNotificationsUseCase } from '../../useCase/clearNotifications.ts';
import type { DismissNotificationUseCase } from '../../useCase/dismissNotification.ts';
import { defaultImageUrls } from '../mastodon/defaultImages.ts';
import type {
  Account,
  GroupedNotificationsResults,
  Notification,
  NotificationGroup,
  NotificationPolicy,
  Status,
  V1NotificationPolicy,
} from '../mastodon/entities.ts';
import type { StatusAssembler } from '../mastodon/statusAssembler.ts';
import { toBlueskyAccount } from '../mastodon/toBlueskyAccount.ts';
import { toBlueskyStatus } from '../mastodon/toBlueskyStatus.ts';
import {
  selectDomainTypes,
  targetPostIdOf,
  toGroupedNotificationId,
  toNotification,
  toStrictlyDescending,
  triggerOf,
} from '../mastodon/toNotification.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import {
  linkHeaderOf,
  notificationLimits,
  parseLimit,
  parsePageRequest,
  respondWithPage,
  toNewestFirst,
  unreadCountLimits,
} from './helper/mastodonPage.ts';
import { resolveViewer } from './helper/mastodonViewer.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonNotificationsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  statusAssembler: StatusAssembler;
  notificationsResolverByPage: NotificationsResolverByPage;
  notificationResolverByUserIdAndId: NotificationResolverByUserIdAndId;
  notificationCountResolverSinceMarker: NotificationCountResolverSinceMarker;
  dismissNotificationUseCase: DismissNotificationUseCase;
  clearNotificationsUseCase: ClearNotificationsUseCase;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const readNotifications = Scope.orThrow('read:notifications');
const writeNotifications = Scope.orThrow('write:notifications');
const ungroupedKeyPattern = /^ungrouped-(.+)$/;

const notificationPolicy: NotificationPolicy = {
  for_not_following: 'accept',
  for_not_followers: 'accept',
  for_new_accounts: 'accept',
  for_private_mentions: 'filter',
  for_limited_accounts: 'filter',
  summary: { pending_requests_count: 0, pending_notifications_count: 0 },
};

const v1NotificationPolicy: V1NotificationPolicy = {
  filter_not_following: notificationPolicy.for_not_following !== 'accept',
  filter_not_followers: notificationPolicy.for_not_followers !== 'accept',
  filter_new_accounts: notificationPolicy.for_new_accounts !== 'accept',
  filter_private_mentions: notificationPolicy.for_private_mentions !== 'accept',
  summary: notificationPolicy.summary,
};

const queryList = (c: Context, name: string): string[] => [
  ...(c.req.queries(`${name}[]`) ?? []),
  ...(c.req.queries(name) ?? []),
];

const uniqueBy = <T>(items: ReadonlyArray<T>, keyOf: (item: T) => string): T[] => [
  ...new Map(items.map((item) => [keyOf(item), item])).values(),
];

const isBlueskyTargetNotification = (notification: DomainNotification): boolean =>
  notification.type === 'blueskyLike' || notification.type === 'blueskyRepost';

const synthesizeBlueskyStatus = (
  notification: DomainNotification,
  options: Readonly<{
    createdAt: Instant;
    account: Account;
    recipientAccount: Account | undefined;
    defaultImages: Parameters<typeof toBlueskyAccount>[1];
  }>,
): Status | null => {
  switch (notification.type) {
    case 'blueskyLike':
    case 'blueskyRepost':
      return toBlueskyStatus(notification, {
        createdAt: options.createdAt,
        account: options.recipientAccount ?? options.account,
      });
    case 'blueskyLikeViaRepost':
    case 'blueskyRepostViaRepost': {
      const did = blueskyDidOfUri(notification.subjectUri);
      return did === undefined ? null : toBlueskyStatus(notification, {
        createdAt: options.createdAt,
        account: toBlueskyAccount(
          { did, handle: did, displayName: null, avatarUrl: null },
          options.defaultImages,
        ),
      });
    }
    case 'blueskyMention':
      return toBlueskyStatus(notification, { createdAt: options.createdAt, account: options.account });
    default:
      return null;
  }
};

const toGroup = (notification: Notification): NotificationGroup => ({
  group_key: `ungrouped-${notification.id}`,
  notifications_count: 1,
  type: notification.type,
  most_recent_notification_id: toGroupedNotificationId(notification.id, Date.parse(notification.created_at)),
  page_min_id: notification.id,
  page_max_id: notification.id,
  latest_page_notification_at: notification.created_at,
  sample_account_ids: [notification.account.id],
  ...(notification.status === undefined ? {} : { status_id: notification.status.id }),
  ...(notification.iori === undefined ? {} : { iori: notification.iori }),
});

export const createWorkerMastodonNotificationsRouter = ({
  authn,
  actorResolverByUserId,
  postsWithAuthorResolverByPostIds,
  statusAssembler,
  notificationsResolverByPage,
  notificationResolverByUserIdAndId,
  notificationCountResolverSinceMarker,
  dismissNotificationUseCase,
  clearNotificationsUseCase,
}: WorkerMastodonNotificationsRouterDeps): Hono<MastodonAuthEnv> => {
  const toNotifications = async (
    items: ReadonlyArray<NotificationItem>,
    viewerActorId: ActorId | undefined,
    requestUrl: string,
  ): Promise<Notification[]> => {
    const needsRecipientAccount = viewerActorId !== undefined
      && items.some(({ notification }) => isBlueskyTargetNotification(notification));
    const actorIds = [
      ...new Set([
        ...items.flatMap(({ notification }) => {
          const trigger = triggerOf(notification);
          return trigger.kind === 'actor' ? [trigger.actorId] : [];
        }),
        ...(needsRecipientAccount ? [viewerActorId] : []),
      ]),
    ];
    const postIds = [
      ...new Set(items.flatMap(({ notification }) => targetPostIdOf(notification) ?? [])),
    ];
    const posts = postIds.length === 0
      ? undefined
      : await postsWithAuthorResolverByPostIds.resolve({
        postIds,
        currentActorId: viewerActorId,
        onlyVisibleToViewer: true,
      });
    if (posts !== undefined && !posts.ok) {
      throw new Error('Failed to resolve notification posts');
    }
    const [accounts, statuses] = await Promise.all([
      statusAssembler.assembleAccounts({ actorIds, requestUrl }),
      statusAssembler.assemble({
        sources: postIds.flatMap((postId: PostId) => {
          const post = posts?.val.get(postId);
          return post === undefined ? [] : [{ type: 'post' as const, post }];
        }),
        viewerActorId,
        requestUrl,
      }),
    ]);
    const accountById = new Map<string, Account>(accounts.map((account) => [account.id, account]));
    const statusById = new Map<string, Status>(statuses.map((status) => [status.id, status]));
    const defaultImages = defaultImageUrls(requestUrl);
    return items.flatMap(({ notification, createdAt }): Notification[] => {
      const trigger = triggerOf(notification);
      const account = trigger.kind === 'actor'
        ? accountById.get(trigger.actorId)
        : toBlueskyAccount(trigger.author, defaultImages);
      const postId = targetPostIdOf(notification);
      const resolved = postId === undefined ? null : statusById.get(postId) ?? null;
      if (account === undefined || (trigger.kind === 'actor' && postId !== undefined && resolved === null)) {
        return [];
      }
      const recipientAccount = viewerActorId === undefined ? undefined : accountById.get(viewerActorId);
      const status = resolved
        ?? synthesizeBlueskyStatus(notification, { createdAt, account, recipientAccount, defaultImages });
      return [toNotification(notification, { createdAt, account, status })];
    });
  };

  const listNotifications = async (c: Context<MastodonAuthEnv>, userId: UserId) => {
    const principal = getMastodonPrincipal(c);
    const page = parsePageRequest(c, notificationLimits);
    const [viewer, items] = await Promise.all([
      resolveViewer(actorResolverByUserId, principal),
      notificationsResolverByPage.resolve({
        recipientUserId: userId,
        page,
        types: selectDomainTypes({ types: queryList(c, 'types'), excludeTypes: queryList(c, 'exclude_types') }),
      }),
    ]);
    if (!viewer.ok || !items.ok) {
      return undefined;
    }
    const ordered = toNewestFirst(items.val, page);
    return {
      notifications: await toNotifications(ordered, viewer.viewerActorId, c.req.url),
      rowIds: ordered.map(({ notification }) => notification.notificationId),
    };
  };

  const countUnread = async (c: Context<MastodonAuthEnv>, userId: UserId) => {
    const count = await notificationCountResolverSinceMarker.resolve({
      userId,
      types: selectDomainTypes({ types: queryList(c, 'types'), excludeTypes: queryList(c, 'exclude_types') }),
      limit: parseLimit(c.req.query('limit'), unreadCountLimits),
    });
    return count.ok ? c.json({ count: count.val }) : c.json(internalServerError, 500);
  };

  const dismiss = async (c: Context<MastodonAuthEnv>, rawId: string | undefined) => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) {
      return c.json(invalidToken, 401);
    }
    const notificationId = NotificationId.parse(rawId);
    if (!notificationId.ok) {
      return c.json(recordNotFound, 404);
    }
    const dismissed = await dismissNotificationUseCase.run({ userId, notificationId: notificationId.val });
    return dismissed.ok ? c.json({}) : c.json(recordNotFound, 404);
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .post('/v1/notifications/clear', authn.requireUser(writeNotifications), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      await clearNotificationsUseCase.run({ userId });
      return c.json({});
    })
    .post('/v1/notifications/:id/dismiss', authn.requireUser(writeNotifications), (c) => dismiss(c, c.req.param('id')))
    .post(
      '/v2/notifications/:group_key/dismiss',
      authn.requireUser(writeNotifications),
      (c) => dismiss(c, ungroupedKeyPattern.exec(c.req.param('group_key'))?.[1]),
    )
    .get('/v1/notifications', authn.requireUser(readNotifications), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const result = await listNotifications(c, userId);
      return result === undefined
        ? c.json(internalServerError, 500)
        : respondWithPage(c, result.notifications, result.rowIds);
    })
    .get('/v1/notifications/unread_count', authn.requireUser(readNotifications), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      return userId === null || userId === undefined ? c.json(invalidToken, 401) : countUnread(c, userId);
    })
    .get('/v1/notifications/requests', authn.requireUser(readNotifications), (c) => c.json([]))
    .get('/v1/notifications/policy', authn.requireUser(readNotifications), (c) => c.json(v1NotificationPolicy))
    .get('/v1/notifications/:id', authn.requireUser(readNotifications), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const notificationId = NotificationId.parse(c.req.param('id'));
      if (!notificationId.ok) {
        return c.json(recordNotFound, 404);
      }
      const [viewer, item] = await Promise.all([
        resolveViewer(actorResolverByUserId, getMastodonPrincipal(c)),
        notificationResolverByUserIdAndId.resolve({ recipientUserId: userId, notificationId: notificationId.val }),
      ]);
      if (!viewer.ok || !item.ok) {
        return c.json(internalServerError, 500);
      }
      if (item.val === undefined) {
        return c.json(recordNotFound, 404);
      }
      const [notification] = await toNotifications([item.val], viewer.viewerActorId, c.req.url);
      return notification === undefined ? c.json(recordNotFound, 404) : c.json(notification);
    })
    .get('/v2/notifications/unread_count', authn.requireUser(readNotifications), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      return userId === null || userId === undefined ? c.json(invalidToken, 401) : countUnread(c, userId);
    })
    .get('/v2/notifications/policy', authn.requireUser(readNotifications), (c) => c.json(notificationPolicy))
    .get('/v2/notifications', authn.requireUser(readNotifications), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const result = await listNotifications(c, userId);
      if (result === undefined) {
        return c.json(internalServerError, 500);
      }
      const groups = result.notifications.map(toGroup);
      const mostRecentIds = toStrictlyDescending(groups.map((group) => group.most_recent_notification_id));
      const body: GroupedNotificationsResults = {
        accounts: uniqueBy(result.notifications.map(({ account }) => account), ({ id }) => id),
        statuses: uniqueBy(
          result.notifications.flatMap(({ status }) => status ?? []),
          ({ id }) => id,
        ),
        notification_groups: groups.map((group, index) => ({
          ...group,
          most_recent_notification_id: mostRecentIds[index] ?? group.most_recent_notification_id,
        })),
      };
      const first = result.rowIds[0];
      const last = result.rowIds[result.rowIds.length - 1];
      const link = first === undefined || last === undefined ? undefined : linkHeaderOf(c.req.url, { first, last });
      if (link !== undefined) c.header('Link', link);
      return c.json(body);
    });
};
