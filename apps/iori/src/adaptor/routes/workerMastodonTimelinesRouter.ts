import { Hono } from 'hono';

import type { ActorResolverByUserId, ActorsResolverByFollowerId } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { FederatedTimelineItemsResolver } from '../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { MutedActorIdsResolverByUserId } from '../../domain/mute/mute.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { LocalPostsResolverByPage } from '../../domain/post/post.ts';
import type { TimelineItemsResolverByActorIds } from '../../domain/timeline/timelineItem.ts';
import {
  type StatusAssembler,
  type StatusSource,
  statusSourceId,
  statusSourceOfTimelineItem,
} from '../mastodon/statusAssembler.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { isTrue, parsePageRequest, respondWithPage, timelineLimits, toNewestFirst } from './helper/mastodonPage.ts';
import { resolveViewer } from './helper/mastodonViewer.ts';
import {
  getMastodonPrincipal,
  type MastodonAuthEnv,
  type MastodonAuthn,
  rejectUnlessTokenScope,
  rejectUnlessUser,
} from './mastodonAuthn.ts';

export type WorkerMastodonTimelinesRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  actorsResolverByFollowerId: ActorsResolverByFollowerId;
  mutedActorIdsResolverByUserId: MutedActorIdsResolverByUserId;
  timelineItemsResolverByActorIds: TimelineItemsResolverByActorIds;
  localPostsResolverByPage: LocalPostsResolverByPage;
  federatedTimelineItemsResolver: FederatedTimelineItemsResolver;
  statusAssembler: StatusAssembler;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const readStatuses = Scope.orThrow('read:statuses');

export const createWorkerMastodonTimelinesRouter = ({
  authn,
  actorResolverByUserId,
  actorsResolverByFollowerId,
  mutedActorIdsResolverByUserId,
  timelineItemsResolverByActorIds,
  localPostsResolverByPage,
  federatedTimelineItemsResolver,
  statusAssembler,
}: WorkerMastodonTimelinesRouterDeps): Hono<MastodonAuthEnv> => {
  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/v1/timelines/home', authn.requireUser(readStatuses), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const actor = await actorResolverByUserId.resolve(userId);
      if (!actor.ok) {
        return c.json(internalServerError, 500);
      }
      if (actor.val === undefined) {
        return c.json(actorNotFound, 422);
      }
      const viewerActorId = actor.val.id;
      const page = parsePageRequest(c, timelineLimits);
      const [following, mutedActorIds] = await Promise.all([
        actorsResolverByFollowerId.resolve(viewerActorId),
        mutedActorIdsResolverByUserId.resolve(userId),
      ]);
      if (!following.ok || !mutedActorIds.ok) {
        return c.json(internalServerError, 500);
      }
      const muted = new Set<ActorId>(mutedActorIds.val);
      const items = await timelineItemsResolverByActorIds.resolve({
        actorIds: [viewerActorId, ...following.val.map((followed) => followed.id)].filter((id) => !muted.has(id)),
        currentActorId: viewerActorId,
        createdAt: undefined,
        mutedActorIds: mutedActorIds.val,
        page,
      });
      if (!items.ok) {
        return c.json(internalServerError, 500);
      }
      const sources = toNewestFirst(items.val, page).map(statusSourceOfTimelineItem);
      const statuses = await statusAssembler.assemble({ sources, viewerActorId, requestUrl: c.req.url });
      return respondWithPage(c, statuses, sources.map(statusSourceId));
    })
    .get('/v1/timelines/public', authn.optionalAuth, async (c) => {
      const principal = getMastodonPrincipal(c);
      const remoteOnly = isTrue(c.req.query('remote')) && !isTrue(c.req.query('local'));
      const rejection = remoteOnly
        ? rejectUnlessUser(c, principal, [readStatuses])
        : rejectUnlessTokenScope(c, principal, [readStatuses]);
      if (rejection !== undefined) {
        return rejection;
      }
      const page = parsePageRequest(c, timelineLimits);
      const viewer = await resolveViewer(actorResolverByUserId, principal);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      const { viewerActorId } = viewer;
      const userId = principal?.userId;
      const mutedActorIds = viewerActorId === undefined || userId === null || userId === undefined
        ? undefined
        : await mutedActorIdsResolverByUserId.resolve(userId);
      if (mutedActorIds !== undefined && !mutedActorIds.ok) {
        return c.json(internalServerError, 500);
      }
      const muted = mutedActorIds?.val ?? [];
      const sources = await (async (): Promise<ReadonlyArray<StatusSource> | undefined> => {
        if (remoteOnly) {
          const items = await federatedTimelineItemsResolver.resolve({
            page,
            mutedActorIds: muted,
            currentActorId: viewerActorId,
          });
          return items.ok
            ? toNewestFirst(items.val, page).map((item): StatusSource => ({ type: 'post', post: item.post }))
            : undefined;
        }
        const posts = await localPostsResolverByPage.resolve({
          currentActorId: viewerActorId,
          mutedActorIds: muted,
          page,
        });
        return posts.ok
          ? toNewestFirst(posts.val, page).map((post): StatusSource => ({ type: 'post', post }))
          : undefined;
      })();
      if (sources === undefined) {
        return c.json(internalServerError, 500);
      }
      const statuses = await statusAssembler.assemble({ sources, viewerActorId, requestUrl: c.req.url });
      return respondWithPage(c, statuses, sources.map(statusSourceId));
    });
};
