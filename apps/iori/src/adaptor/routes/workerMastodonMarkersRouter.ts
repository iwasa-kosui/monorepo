import { type Context, Hono } from 'hono';

import type { Marker as DomainMarker, MarkersResolverByUserId } from '../../domain/marker/marker.ts';
import { MarkerTimeline } from '../../domain/marker/marker.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { SaveMarkersUseCase } from '../../useCase/saveMarkers.ts';
import type { Marker } from '../mastodon/entities.ts';
import { toIsoString } from '../mastodon/time.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { readRequestBody, type RequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonMarkersRouterDeps = Readonly<{
  authn: MastodonAuthn;
  markersResolverByUserId: MarkersResolverByUserId;
  saveMarkersUseCase: SaveMarkersUseCase;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const readStatuses = Scope.orThrow('read:statuses');
const writeStatuses = Scope.orThrow('write:statuses');

const markerTimelines: ReadonlyArray<MarkerTimeline> = ['home', 'notifications'];

const readLastReadId = (body: RequestBody, key: string): string | undefined => {
  const nested = body[key];
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    const lastReadId = Reflect.get(nested, 'last_read_id');
    return typeof lastReadId === 'string' && lastReadId.length > 0 ? lastReadId : undefined;
  }
  const flat = body[`${key}[last_read_id]`];
  return typeof flat === 'string' && flat.length > 0 ? flat : undefined;
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
  saveMarkersUseCase,
}: WorkerMastodonMarkersRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
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
      const entries = markerTimelines.flatMap((timeline) => {
        const lastReadId = readLastReadId(body, timeline);
        return lastReadId === undefined ? [] : [{ timeline, lastReadId }];
      });
      const saved = await saveMarkersUseCase.run({ userId, entries });
      return saved.ok ? c.json(toMarkersBody(saved.val)) : c.json(internalServerError, 500);
    });
