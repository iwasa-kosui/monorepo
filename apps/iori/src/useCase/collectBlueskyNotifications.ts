import { RA, Result } from '@iwasa-kosui/result';

import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPush.ts';
import {
  BLUESKY_NOTIFICATION_MAX_PAGES,
  BLUESKY_NOTIFICATION_PAGE_LIMIT,
  BLUESKY_NOTIFICATION_PUSH_FRESH_WINDOW_MS,
  BLUESKY_NOTIFICATION_PUSH_MAX_PER_RUN,
  BLUESKY_NOTIFICATION_RETENTION_DAYS,
  BLUESKY_NOTIFICATION_SAVE_CHUNK,
  type BlueskyFetchedNotification,
  type BlueskyNotificationExistingUrisResolver,
  type BlueskyNotificationInitialSyncCompletedStore,
  type BlueskyNotificationSyncStateResolver,
  type PostIdsResolverByBlueskyUris,
  subjectUriOf,
} from '../domain/blueskyNotification/blueskyNotification.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  type BlueskyNotification,
  type BlueskyNotificationCreated,
  type BlueskyNotificationCreatedStore,
  Notification,
} from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import type { UserResolverByUsername } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { Username } from '../domain/user/username.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyNotificationFetcher } from '../ports/blueskyNotificationFetcher.ts';
import type { UseCase } from './useCase.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTIFICATIONS_URL = '/notifications';

type Input = void;

type Ok = Readonly<{ pages: number; fetched: number; saved: number; dropped: number; pushed: number }>;

type Err = BlueskyClientError;

export type CollectBlueskyNotificationsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  fetcher: BlueskyNotificationFetcher;
  ownerUsername: Username;
  userResolverByUsername: UserResolverByUsername;
  syncStateResolver: BlueskyNotificationSyncStateResolver;
  initialSyncCompletedStore: BlueskyNotificationInitialSyncCompletedStore;
  existingUrisResolver: BlueskyNotificationExistingUrisResolver;
  postIdsResolver: PostIdsResolverByBlueskyUris;
  createdStore: BlueskyNotificationCreatedStore;
  pushSubscriptionsResolverByUserId: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
  now: () => Instant;
}>;

const nothingCollected: Ok = { pages: 0, fetched: 0, saved: 0, dropped: 0, pushed: 0 };

const uniqueByUri = (items: readonly BlueskyFetchedNotification[]): BlueskyFetchedNotification[] => {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.uri) && seen.add(item.uri));
};

const buildBlueskyNotificationFromFetched = (
  item: BlueskyFetchedNotification,
  recipientUserId: UserId,
  postIds: ReadonlyMap<string, PostId>,
): BlueskyNotification => {
  const base = {
    notificationId: NotificationId.generate(),
    recipientUserId,
    isRead: false,
    blueskyUri: item.uri,
    author: item.author,
  };
  switch (item.reason) {
    case 'like':
      return {
        ...base,
        type: 'blueskyLike',
        subjectUri: item.subjectUri,
        targetPostId: postIds.get(item.subjectUri) ?? null,
      };
    case 'repost':
      return {
        ...base,
        type: 'blueskyRepost',
        subjectUri: item.subjectUri,
        targetPostId: postIds.get(item.subjectUri) ?? null,
      };
    case 'follow':
      return { ...base, type: 'blueskyFollow' };
    case 'mention':
    case 'reply':
    case 'quote':
      return {
        ...base,
        type: 'blueskyMention',
        reason: item.reason,
        subjectUri: item.subjectUri,
        targetPostId: item.subjectUri === null ? null : postIds.get(item.subjectUri) ?? null,
        text: item.text,
      };
  }
};

const createdAtsOf = (
  oldestFirst: readonly BlueskyFetchedNotification[],
  startedAt: Instant,
  isFirstRun: boolean,
): Instant[] =>
  oldestFirst.reduce<Instant[]>((result, item, index) => {
    const previous = result.at(-1);
    const wanted = isFirstRun ? Math.min(item.indexedAt, startedAt) : startedAt + index;
    result.push((previous === undefined ? wanted : Math.max(wanted, previous + 1)) as Instant);
    return result;
  }, []);

const pushPayloadOf = (item: BlueskyFetchedNotification): PushPayload => {
  const name = item.author.displayName ?? item.author.handle;
  switch (item.reason) {
    case 'like':
      return { title: '新しいいいね', body: `${name} があなたの投稿にいいねしました`, url: NOTIFICATIONS_URL };
    case 'repost':
      return { title: '新しいリポスト', body: `${name} があなたの投稿をリポストしました`, url: NOTIFICATIONS_URL };
    case 'follow':
      return { title: '新しいフォロー', body: `${name} があなたをフォローしました`, url: NOTIFICATIONS_URL };
    case 'mention':
      return { title: '新しいメンション', body: `${name} があなたをメンションしました`, url: NOTIFICATIONS_URL };
    case 'reply':
      return { title: '新しい返信', body: `${name} があなたの投稿に返信しました`, url: NOTIFICATIONS_URL };
    case 'quote':
      return { title: '新しい引用', body: `${name} があなたの投稿を引用しました`, url: NOTIFICATIONS_URL };
  }
};

const create = (
  {
    fetcher,
    ownerUsername,
    userResolverByUsername,
    syncStateResolver,
    initialSyncCompletedStore,
    existingUrisResolver,
    postIdsResolver,
    createdStore,
    pushSubscriptionsResolverByUserId,
    webPushSender,
    now,
  }: Deps,
): CollectBlueskyNotificationsUseCase => {
  const push = async (userId: UserId, items: readonly BlueskyFetchedNotification[]): Promise<number> => {
    const individual = items.slice(0, BLUESKY_NOTIFICATION_PUSH_MAX_PER_RUN);
    const rest = items.length - individual.length;
    const payloads = [
      ...individual.map(pushPayloadOf),
      ...(rest > 0
        ? [{ title: 'Bluesky の新しい通知', body: `ほか ${rest} 件の通知があります`, url: NOTIFICATIONS_URL }]
        : []),
    ];
    if (payloads.length === 0) return 0;
    const subscriptions = Result.unsafeUnwrap(await pushSubscriptionsResolverByUserId.resolve(userId));
    let pushed = 0;
    for (const payload of payloads) {
      for (const subscription of subscriptions) {
        try {
          const sent = await webPushSender.send(subscription, payload);
          if (sent.ok) {
            pushed += 1;
          } else {
            console.error('iori bluesky notifications: sending a web push failed.', {
              subscriptionId: subscription.subscriptionId,
              errorMessage: sent.err.message,
              statusCode: sent.err.statusCode,
            });
          }
        } catch (error) {
          console.error('iori bluesky notifications: sending a web push threw.', {
            subscriptionId: subscription.subscriptionId,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return pushed;
  };

  const run = async (): RA<Ok, Err> => {
    const startedAt = now();
    const owner = Result.unsafeUnwrap(await userResolverByUsername.resolve(ownerUsername));
    if (owner === undefined) return RA.ok(nothingCollected);
    const isFirstRun = Result.unsafeUnwrap(await syncStateResolver.resolve()) === undefined;
    const retentionStart = Instant.addDuration(startedAt, -BLUESKY_NOTIFICATION_RETENTION_DAYS * DAY_MS);

    const collected: BlueskyFetchedNotification[] = [];
    const existing = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    let dropped = 0;
    while (pages < BLUESKY_NOTIFICATION_MAX_PAGES) {
      const page = await fetcher.fetch({ limit: BLUESKY_NOTIFICATION_PAGE_LIMIT, cursor });
      if (!page.ok) return RA.err(page.err);
      pages += 1;
      dropped += page.val.dropped;
      const known = Result.unsafeUnwrap(await existingUrisResolver.resolve(page.val.items.map((item) => item.uri)));
      known.forEach((uri) => existing.add(uri));
      collected.push(...page.val.items);
      cursor = page.val.cursor;
      if (known.length > 0 || page.val.items.some((item) => item.indexedAt < retentionStart) || cursor === undefined) {
        break;
      }
    }

    const recent = uniqueByUri(collected.filter((item) => item.indexedAt >= retentionStart));
    const added = recent.filter((item) => !existing.has(item.uri)).reverse()
      .sort((a, b) => a.indexedAt - b.indexedAt);
    const completeInitialSync = async (): Promise<void> => {
      if (isFirstRun) Result.unsafeUnwrap(await initialSyncCompletedStore.store(startedAt));
    };
    if (added.length === 0) {
      await completeInitialSync();
      return RA.ok({ pages, fetched: recent.length, saved: 0, dropped, pushed: 0 });
    }

    const subjectUris = [...new Set(added.flatMap((item) => subjectUriOf(item) ?? []))];
    const postIds = Result.unsafeUnwrap(await postIdsResolver.resolve(subjectUris));
    const createdAts = createdAtsOf(added, startedAt, isFirstRun);
    const events: BlueskyNotificationCreated[] = added.map((item, index) =>
      Notification.createBlueskyNotification(
        buildBlueskyNotificationFromFetched(item, owner.id, postIds),
        createdAts[index]!,
      )
    );
    for (let index = 0; index < events.length; index += BLUESKY_NOTIFICATION_SAVE_CHUNK) {
      Result.unsafeUnwrap(await createdStore.store(...events.slice(index, index + BLUESKY_NOTIFICATION_SAVE_CHUNK)));
    }
    await completeInitialSync();

    const freshStart = Instant.addDuration(startedAt, -BLUESKY_NOTIFICATION_PUSH_FRESH_WINDOW_MS);
    const pushed = isFirstRun
      ? 0
      : await push(owner.id, added.filter((item) => item.indexedAt >= freshStart).reverse());
    return RA.ok({ pages, fetched: recent.length, saved: added.length, dropped, pushed });
  };

  return { run };
};

export const CollectBlueskyNotificationsUseCase = {
  create,
} as const;
