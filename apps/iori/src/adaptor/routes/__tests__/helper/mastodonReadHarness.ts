import { afterEach } from 'vitest';

import { createIoriApp } from '../../../../appFactory.tsx';
import type { TextGenerator } from '../../../../ports/textGenerator.ts';
import { createSearchTimelineUseCase } from '../../../../useCase/searchTimeline.ts';
import { createMastodonSeed } from '../../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../../d1/__tests__/sqliteFixture.ts';
import { createD1AccountProfilesResolverByActorIds } from '../../../d1/actor/accountProfilesResolverByActorIds.ts';
import { createD1ActorResolverById } from '../../../d1/actor/actorResolverById.ts';
import { createD1ActorResolverByUserId } from '../../../d1/actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowerId } from '../../../d1/actor/actorsResolverByFollowerId.ts';
import { createD1FederatedTimelineItemsResolver } from '../../../d1/federatedTimeline/federatedTimelineItemsResolver.ts';
import {
  createD1ActorIdsResolverByFollowerIdWithPagination,
  createD1ActorIdsResolverByFollowingIdWithPagination,
} from '../../../d1/follow/actorIdsResolverByFollowsWithPagination.ts';
import { createD1MutedActorIdsResolverByUserId } from '../../../d1/mute/mutedActorIdsResolverByUserId.ts';
import { createD1AccountStatusItemsResolverByActorId } from '../../../d1/post/accountStatusItemsResolverByActorId.ts';
import { createD1LocalPostsResolverByPage } from '../../../d1/post/localPostsResolverByPage.ts';
import { createD1PostExtrasResolverByPosts } from '../../../d1/post/postExtrasResolverByPosts.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../../../d1/post/postWithAuthorBatch.ts';
import { createD1ThreadResolver } from '../../../d1/post/threadResolver.ts';
import { createD1RepostResolverById } from '../../../d1/repost/repostResolverById.ts';
import { createD1TimelineItemsResolverByActorIds } from '../../../d1/timeline/timelineItemsResolverByActorIds.ts';
import { createD1TimelineSearchCandidatesResolver } from '../../../d1/timelineSearch/timelineSearchCandidatesResolver.ts';
import { createStatusAssembler } from '../../../mastodon/statusAssembler.ts';
import { htmlToPlainText } from '../../../text/htmlToPlainText.ts';
import { createMastodonAuthn } from '../../mastodonAuthn.ts';
import { createWorkerIoriSearchRouter } from '../../workerIoriSearchRouter.ts';
import { createWorkerMastodonAccountsRouter } from '../../workerMastodonAccountsRouter.ts';
import { createWorkerMastodonFallbackRouter } from '../../workerMastodonFallbackRouter.ts';
import { createWorkerMastodonStatusesRouter } from '../../workerMastodonStatusesRouter.ts';
import { createWorkerMastodonTimelinesRouter } from '../../workerMastodonTimelinesRouter.ts';
import { createOAuthHarness, ORIGIN } from './oauthHarness.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

export const setupReadApi = (options: Readonly<{ textGenerator?: TextGenerator }> = {}) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const { db } = fixture;
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: harness.memory.sessionResolver as never,
  });
  const actorResolverByUserId = createD1ActorResolverByUserId(db);
  const statusAssembler = createStatusAssembler({
    accountProfilesResolver: createD1AccountProfilesResolverByActorIds(db),
    postExtrasResolver: createD1PostExtrasResolverByPosts(db, ORIGIN),
  });
  const app = createIoriApp({
    federationMiddleware: undefined,
    registerRoutes: (root) => {
      root.route(
        '/api',
        createWorkerMastodonTimelinesRouter({
          authn,
          actorResolverByUserId,
          actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
          mutedActorIdsResolverByUserId: createD1MutedActorIdsResolverByUserId(db),
          timelineItemsResolverByActorIds: createD1TimelineItemsResolverByActorIds(db),
          localPostsResolverByPage: createD1LocalPostsResolverByPage(db),
          federatedTimelineItemsResolver: createD1FederatedTimelineItemsResolver(db),
          statusAssembler,
        }),
      );
      root.route(
        '/api',
        createWorkerMastodonStatusesRouter({
          authn,
          actorResolverByUserId,
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          repostResolverById: createD1RepostResolverById(db),
          threadResolver: createD1ThreadResolver(db, ORIGIN),
          statusAssembler,
        }),
      );
      root.route(
        '/api',
        createWorkerMastodonAccountsRouter({
          authn,
          actorResolverByUserId,
          actorResolverById: createD1ActorResolverById(db),
          accountStatusItemsResolverByActorId: createD1AccountStatusItemsResolverByActorId(db),
          actorIdsResolverByFollowerId: createD1ActorIdsResolverByFollowerIdWithPagination(db),
          actorIdsResolverByFollowingId: createD1ActorIdsResolverByFollowingIdWithPagination(db),
          statusAssembler,
        }),
      );
      root.route(
        '/api',
        createWorkerIoriSearchRouter({
          authn,
          actorResolverByUserId,
          searchTimeline: createSearchTimelineUseCase({
            actorResolverByUserId,
            actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
            mutedActorIdsResolverByUserId: createD1MutedActorIdsResolverByUserId(db),
            textGenerator: options.textGenerator,
            timelineSearchCandidatesResolver: createD1TimelineSearchCandidatesResolver(db),
            htmlToPlainText,
          }),
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          statusAssembler,
        }),
      );
      root.route('/api', createWorkerMastodonFallbackRouter());
    },
    serveAsset: async () => undefined,
    serveUpload: async () => undefined,
    serveOgImage: async () => new Response('og', { status: 200 }),
  });
  const request = (path: string, init?: RequestInit) => app.request(`${ORIGIN}${path}`, init);

  const signIn = async (scope = 'read') => {
    const issued = await harness.issueUserToken(scope);
    const me = seed.addLocalActor('kosui', issued.userId);
    return {
      ...me,
      token: issued.token,
      sessionId: issued.sessionId,
      bearer: { Authorization: `Bearer ${issued.token}` },
    };
  };

  const bearerFor = async (scope: string) => ({
    Authorization: `Bearer ${(await harness.issueUserToken(scope)).token}`,
  });

  return { ...harness, seed, request, signIn, bearerFor, queries: fixture.queries };
};

export const idsOf = (body: unknown): string[] => (body as ReadonlyArray<{ id: string }>).map((item) => item.id);

export const linkOf = (response: Response, rel: 'next' | 'prev'): URL | undefined => {
  const header = response.headers.get('Link');
  const match = header === null ? null : new RegExp(`<([^>]+)>; rel="${rel}"`).exec(header);
  return match === null ? undefined : new URL(match[1]!);
};
