import { type Context, Hono } from 'hono';

import { Instant } from '../../domain/instant/instant.ts';
import type { Marker as DomainMarker, MarkersResolverByUserId } from '../../domain/marker/marker.ts';
import { MarkerTimeline } from '../../domain/marker/marker.ts';
import type { NotificationIdsResolverByUserIdAndCreatedAt } from '../../domain/notification/notification.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { SaveMarkersUseCase } from '../../useCase/saveMarkers.ts';
import type { Marker } from '../mastodon/entities.ts';
import { toIsoString } from '../mastodon/time.ts';
import { toGroupedNotificationId } from '../mastodon/toNotification.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { readRequestBody, type RequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonMarkersRouterDeps = Readonly<{
  authn: MastodonAuthn;
  markersResolverByUserId: MarkersResolverByUserId;
  notificationIdsResolverByUserIdAndCreatedAt: NotificationIdsResolverByUserIdAndCreatedAt;
  saveMarkersUseCase: SaveMarkersUseCase;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const readStatuses = Scope.orThrow('read:statuses');
const writeStatuses = Scope.orThrow('write:statuses');

const markerTimelines: ReadonlyArray<MarkerTimeline> = ['home', 'notifications'];

const integerPattern = /^\d+$/;

const readLastReadId = (body: RequestBody, key: string): string | number | undefined => {
  const nested = body[key];
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    const lastReadId = Reflect.get(nested, 'last_read_id');
    if (typeof lastReadId === 'number') return lastReadId;
    return typeof lastReadId === 'string' && lastReadId.length > 0 ? lastReadId : undefined;
  }
  const flat = body[`${key}[last_read_id]`];
  return typeof flat === 'string' && flat.length > 0 ? flat : undefined;
};

const toGroupedId = (lastReadId: string | number): number | undefined => {
  const value = typeof lastReadId === 'number'
    ? lastReadId
    : integerPattern.test(lastReadId)
    ? Number(lastReadId)
    : undefined;
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

const toMarkersBody = (markers: ReadonlyArray<DomainMarker>): Partial<Record<MarkerTimeline, Marker>> =>
  Object.fromEntries(markers.map((marker) => [marker.timeline, {
    last_read_id: marker.lastReadId,
    version: marker.version,
    updated_at: toIsoString(marker.updatedAt),
  }]));

const requestedTimelines = (c: Context): MarkerTimeline[] => [
  ...new Set(
    [...(c.req.queries('timeline[]') ?? []), ...(c.req.queries('timeline') ?? [])].flatMap((value) => {
      const timeline = MarkerTimeline.parse(value);
      return timeline.ok ? [timeline.val] : [];
    }),
  ),
];

export const createWorkerMastodonMarkersRouter = ({
  authn,
  markersResolverByUserId,
  notificationIdsResolverByUserIdAndCreatedAt,
  saveMarkersUseCase,
}: WorkerMastodonMarkersRouterDeps): Hono<MastodonAuthEnv> => {
  const resolveNotificationLastReadId = async (
    userId: UserId,
    lastReadId: string | number,
  ): Promise<string | undefined> => {
    if (typeof lastReadId === 'string' && !integerPattern.test(lastReadId)) return lastReadId;
    // most_recent_notification_id の整数を既読位置に送るクライアントがあるため、通知の UUID に戻して保存する
    const groupedId = toGroupedId(lastReadId);
    if (groupedId === undefined) return undefined;
    const createdAtMs = Math.floor(groupedId / 1024);
    const candidates = await notificationIdsResolverByUserIdAndCreatedAt.resolve({
      recipientUserId: userId,
      createdAt: Instant.orThrow(createdAtMs),
    });
    if (!candidates.ok) throw new Error('Failed to resolve notifications for the marker');
    return candidates.val
      .filter((notificationId) => toGroupedNotificationId(notificationId, createdAtMs) === groupedId)
      .reduce<string | undefined>(
        (max, notificationId) => max === undefined || notificationId > max ? notificationId : max,
        undefined,
      );
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/v1/markers', authn.requireUser(readStatuses), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const markers = await markersResolverByUserId.resolve({ userId, timelines: requestedTimelines(c) });
      return markers.ok ? c.json(toMarkersBody(markers.val)) : c.json(internalServerError, 500);
    })
    .post('/v1/markers', authn.requireUser(writeStatuses), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const body = await readRequestBody(c);
      const entries = (await Promise.all(markerTimelines.map(async (timeline) => {
        const raw = readLastReadId(body, timeline);
        const lastReadId = timeline === 'notifications'
          ? raw === undefined ? undefined : await resolveNotificationLastReadId(userId, raw)
          : typeof raw === 'string'
          ? raw
          : undefined;
        return lastReadId === undefined ? [] : [{ timeline, lastReadId }];
      }))).flat();
      const saved = await saveMarkersUseCase.run({ userId, entries });
      return saved.ok ? c.json(toMarkersBody(saved.val)) : c.json(internalServerError, 500);
    });
};
