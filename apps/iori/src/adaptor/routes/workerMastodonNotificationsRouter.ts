import { type Context, Hono } from 'hono';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type {
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
import type {
  Account,
  GroupedNotificationsResults,
  Notification,
  NotificationGroup,
  NotificationPolicy,
  Status,
} from '../mastodon/entities.ts';
import type { StatusAssembler } from '../mastodon/statusAssembler.ts';
import { selectDomainTypes, targetPostIdOf, toNotification, triggerActorIdOf } from '../mastodon/toNotification.ts';
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
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const readNotifications = Scope.orThrow('read:notifications');

const notificationPolicy: NotificationPolicy = {
  for_not_following: 'accept',
  for_not_followers: 'accept',
  for_new_accounts: 'accept',
  for_private_mentions: 'filter',
  for_limited_accounts: 'filter',
  summary: { pending_requests_count: 0, pending_notifications_count: 0 },
};

const queryList = (c: Context, name: string): string[] => [
  ...(c.req.queries(`${name}[]`) ?? []),
  ...(c.req.queries(name) ?? []),
];

const uniqueBy = <T>(items: ReadonlyArray<T>, keyOf: (item: T) => string): T[] => [
  ...new Map(items.map((item) => [keyOf(item), item])).values(),
];

const toGroup = (notification: Notification): NotificationGroup => ({
  group_key: `ungrouped-${notification.id}`,
  notifications_count: 1,
  type: notification.type,
  most_recent_notification_id: notification.id,
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
}: WorkerMastodonNotificationsRouterDeps): Hono<MastodonAuthEnv> => {
  const toNotifications = async (
    items: ReadonlyArray<NotificationItem>,
    viewerActorId: ActorId | undefined,
    requestUrl: string,
  ): Promise<Notification[]> => {
    const actorIds = [...new Set(items.map(({ notification }) => triggerActorIdOf(notification)))];
    const postIds = [
      ...new Set(items.flatMap(({ notification }) => targetPostIdOf(notification) ?? [])),
    ];
    const posts = postIds.length === 0
      ? undefined
      : await postsWithAuthorResolverByPostIds.resolve({ postIds, currentActorId: viewerActorId });
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
    return items.flatMap(({ notification, createdAt }): Notification[] => {
      const account = accountById.get(triggerActorIdOf(notification));
      const postId = targetPostIdOf(notification);
      const status = postId === undefined ? null : statusById.get(postId) ?? null;
      return account === undefined || (postId !== undefined && status === null)
        ? []
        : [toNotification(notification, { createdAt, account, status })];
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

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
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
      const body: GroupedNotificationsResults = {
        accounts: uniqueBy(result.notifications.map(({ account }) => account), ({ id }) => id),
        statuses: uniqueBy(
          result.notifications.flatMap(({ status }) => status ?? []),
          ({ id }) => id,
        ),
        notification_groups: result.notifications.map(toGroup),
      };
      const first = result.rowIds[0];
      const last = result.rowIds[result.rowIds.length - 1];
      const link = first === undefined || last === undefined ? undefined : linkHeaderOf(c.req.url, { first, last });
      if (link !== undefined) c.header('Link', link);
      return c.json(body);
    });
};
