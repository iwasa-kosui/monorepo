import { Hono } from 'hono';

import type { ActorResolverByUserId, ActorsResolverByFollowerId } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { FederatedTimelineItemsResolver } from '../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { MutedActorIdsResolverByUserId } from '../../domain/mute/mute.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { LocalPostsResolverByPage } from '../../domain/post/post.ts';
import type { TimelineItemsResolverByActorIds } from '../../domain/timeline/timelineItem.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { type StatusAssembler, type StatusSource, statusSourceOfTimelineItem } from '../mastodon/statusAssembler.ts';
import { parsePageRequest, respondWithPage, timelineLimits, toNewestFirst } from './helper/mastodonPage.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn, rejectUnlessUser } from './mastodonAuthn.ts';

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

const isTrue = (value: string | undefined): boolean => value === 'true' || value === '1';

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
  const resolveViewerActorId = async (userId: UserId | null | undefined): Promise<ActorId | undefined> => {
    if (userId === null || userId === undefined) {
      return undefined;
    }
    const actor = await actorResolverByUserId.resolve(userId);
    return actor.ok ? actor.val?.id : undefined;
  };

  return new Hono<MastodonAuthEnv>()
    .get('/v1/timelines/home', authn.requireUser(readStatuses), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      const viewerActorId = await resolveViewerActorId(userId);
      if (userId === null || userId === undefined || viewerActorId === undefined) {
        return c.json(invalidToken, 401);
      }
      const page = parsePageRequest(c, timelineLimits);
      const [following, mutedActorIds] = await Promise.all([
        actorsResolverByFollowerId.resolve(viewerActorId),
        mutedActorIdsResolverByUserId.resolve(userId),
      ]);
      if (!following.ok || !mutedActorIds.ok) {
        return c.json(invalidToken, 401);
      }
      const muted = new Set<ActorId>(mutedActorIds.val);
      const items = await timelineItemsResolverByActorIds.resolve({
        actorIds: [viewerActorId, ...following.val.map((actor) => actor.id)].filter((id) => !muted.has(id)),
        currentActorId: viewerActorId,
        createdAt: undefined,
        mutedActorIds: mutedActorIds.val,
        page,
      });
      if (!items.ok) {
        return c.json(invalidToken, 401);
      }
      const statuses = await statusAssembler.assemble({
        sources: toNewestFirst(items.val, page).map(statusSourceOfTimelineItem),
        viewerActorId,
        requestUrl: c.req.url,
      });
      return respondWithPage(c, statuses, (status) => status.id);
    })
    .get('/v1/timelines/public', authn.optionalAuth, async (c) => {
      const principal = getMastodonPrincipal(c);
      const remoteOnly = isTrue(c.req.query('remote')) && !isTrue(c.req.query('local'));
      if (remoteOnly) {
        const rejection = rejectUnlessUser(c, principal, [readStatuses]);
        if (rejection !== undefined) {
          return rejection;
        }
      }
      const page = parsePageRequest(c, timelineLimits);
      const viewerActorId = await resolveViewerActorId(principal?.userId);
      const sources = await (async (): Promise<ReadonlyArray<StatusSource>> => {
        if (remoteOnly) {
          const mutedActorIds = principal?.userId === null || principal?.userId === undefined
            ? undefined
            : await mutedActorIdsResolverByUserId.resolve(principal.userId);
          const items = await federatedTimelineItemsResolver.resolve({
            page,
            mutedActorIds: mutedActorIds?.ok ? mutedActorIds.val : [],
            currentActorId: viewerActorId,
          });
          return items.ok
            ? toNewestFirst(items.val, page).map((item): StatusSource => ({ type: 'post', post: item.post }))
            : [];
        }
        const posts = await localPostsResolverByPage.resolve({ currentActorId: viewerActorId, page });
        return posts.ok ? toNewestFirst(posts.val, page).map((post): StatusSource => ({ type: 'post', post })) : [];
      })();
      const statuses = await statusAssembler.assemble({ sources, viewerActorId, requestUrl: c.req.url });
      return respondWithPage(c, statuses, (status) => status.id);
    });
};
