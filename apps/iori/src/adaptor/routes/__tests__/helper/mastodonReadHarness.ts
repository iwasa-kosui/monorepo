import { RA } from '@iwasa-kosui/result';
import { afterEach, vi } from 'vitest';

import { createIoriApp } from '../../../../appFactory.tsx';
import type { TextGenerator } from '../../../../ports/textGenerator.ts';
import { createWorkerRemoteActorActions } from '../../../../runtime/workerCoreUseCases.ts';
import { ClearNotificationsUseCase } from '../../../../useCase/clearNotifications.ts';
import { CreateMuteUseCase } from '../../../../useCase/createMute.ts';
import { DeleteMuteUseCase } from '../../../../useCase/deleteMute.ts';
import { DismissNotificationUseCase } from '../../../../useCase/dismissNotification.ts';
import { ResolveRemoteAccountUseCase } from '../../../../useCase/resolveRemoteAccount.ts';
import { SaveMarkersUseCase } from '../../../../useCase/saveMarkers.ts';
import { createSearchTimelineUseCase } from '../../../../useCase/searchTimeline.ts';
import { SendLikeUseCase } from '../../../../useCase/sendLike.ts';
import { SendRepostUseCase } from '../../../../useCase/sendRepost.ts';
import { UndoLikeUseCase } from '../../../../useCase/undoLike.ts';
import { UndoRepostUseCase } from '../../../../useCase/undoRepost.ts';
import { createMastodonSeed } from '../../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../../d1/__tests__/sqliteFixture.ts';
import { createD1AccountProfilesResolverByActorIds } from '../../../d1/actor/accountProfilesResolverByActorIds.ts';
import { createD1ActorIdResolverByAcct } from '../../../d1/actor/actorIdResolverByAcct.ts';
import { createD1ActorResolverById } from '../../../d1/actor/actorResolverById.ts';
import { createD1ActorResolverByUri } from '../../../d1/actor/actorResolverByUri.ts';
import { createD1ActorResolverByUserId } from '../../../d1/actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowerId } from '../../../d1/actor/actorsResolverByFollowerId.ts';
import { createD1LogoUriUpdatedStore } from '../../../d1/actor/logoUriUpdatedStore.ts';
import { createD1RemoteActorCreatedStore } from '../../../d1/actor/remoteActorCreatedStore.ts';
import { createD1FederatedTimelineItemsResolver } from '../../../d1/federatedTimeline/federatedTimelineItemsResolver.ts';
import { createD1AccountRelationshipsResolverByActorIds } from '../../../d1/follow/accountRelationshipsResolverByActorIds.ts';
import {
  createD1ActorIdsResolverByFollowerIdWithPagination,
  createD1ActorIdsResolverByFollowingIdWithPagination,
} from '../../../d1/follow/actorIdsResolverByFollowsWithPagination.ts';
import { createD1FollowRequestedStore } from '../../../d1/follow/followRequestedStore.ts';
import { createD1FollowResolver } from '../../../d1/follow/followResolver.ts';
import { createD1UndoFollowingProcessedStore } from '../../../d1/follow/undoFollowingProcessedStore.ts';
import { createD1PostImageCreatedStore } from '../../../d1/image/postImageCreatedStore.ts';
import { createD1LikedPostIdsResolverByActorIdWithPagination } from '../../../d1/like/likedPostIdsResolverByActorIdWithPagination.ts';
import { createD1LikeResolver } from '../../../d1/like/likeResolver.ts';
import { createD1LocalLikeCreatedStore } from '../../../d1/like/localLikeCreatedStore.ts';
import { createD1LocalLikeDeletedStore } from '../../../d1/like/localLikeDeletedStore.ts';
import { createD1MarkerSavedStore } from '../../../d1/marker/markerSavedStore.ts';
import { createD1MarkersResolverByUserId } from '../../../d1/marker/markersResolverByUserId.ts';
import { createD1MuteCreatedStore } from '../../../d1/mute/muteCreatedStore.ts';
import { createD1MutedActorIdsResolverByUserId } from '../../../d1/mute/mutedActorIdsResolverByUserId.ts';
import { createD1MutedActorsResolverByUserIdWithPagination } from '../../../d1/mute/mutedActorsResolverByUserIdWithPagination.ts';
import { createD1MuteDeletedStore } from '../../../d1/mute/muteDeletedStore.ts';
import { createD1MuteResolver } from '../../../d1/mute/muteResolver.ts';
import {
  createD1NotificationDismissedStore,
  createD1NotificationsClearedStore,
} from '../../../d1/notification/inboxNotificationAdapters.ts';
import { createD1NotificationCountResolverSinceMarker } from '../../../d1/notification/notificationCountResolverSinceMarker.ts';
import { createD1NotificationResolverByUserIdAndId } from '../../../d1/notification/notificationResolverByUserIdAndId.ts';
import { createD1NotificationsResolverByPage } from '../../../d1/notification/notificationsResolverByPage.ts';
import { createD1AccountStatusItemsResolverByActorId } from '../../../d1/post/accountStatusItemsResolverByActorId.ts';
import { createD1LocalPostsResolverByPage } from '../../../d1/post/localPostsResolverByPage.ts';
import { createD1PostCreatedStore } from '../../../d1/post/postCreatedStore.ts';
import { createD1PostExtrasResolverByPosts } from '../../../d1/post/postExtrasResolverByPosts.ts';
import { createD1PostResolver } from '../../../d1/post/postResolver.ts';
import { createD1PostResolverByUri } from '../../../d1/post/postResolverByUri.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../../../d1/post/postWithAuthorBatch.ts';
import { createD1RemotePostUpserter } from '../../../d1/post/remotePostUpserter.ts';
import { createD1ThreadResolver } from '../../../d1/post/threadResolver.ts';
import { createD1RepostCreatedStore } from '../../../d1/repost/repostCreatedStore.ts';
import { createD1RepostDeletedStore } from '../../../d1/repost/repostDeletedStore.ts';
import { createD1RepostResolver } from '../../../d1/repost/repostResolver.ts';
import { createD1RepostResolverById } from '../../../d1/repost/repostResolverById.ts';
import { createD1TimelineItemCreatedStore } from '../../../d1/timeline/timelineItemCreatedStore.ts';
import { createD1TimelineItemDeletedStore } from '../../../d1/timeline/timelineItemDeletedStore.ts';
import { createD1TimelineItemResolverByRepostId } from '../../../d1/timeline/timelineItemResolverByRepostId.ts';
import { createD1TimelineItemsResolverByActorIds } from '../../../d1/timeline/timelineItemsResolverByActorIds.ts';
import { createD1TimelineSearchCandidatesResolver } from '../../../d1/timelineSearch/timelineSearchCandidatesResolver.ts';
import { createD1UserResolver } from '../../../d1/user/userResolver.ts';
import { createStatusAssembler } from '../../../mastodon/statusAssembler.ts';
import { htmlToPlainText } from '../../../text/htmlToPlainText.ts';
import { createMastodonAuthn } from '../../mastodonAuthn.ts';
import { createWorkerIoriSearchRouter } from '../../workerIoriSearchRouter.ts';
import { createWorkerMastodonAccountsRouter } from '../../workerMastodonAccountsRouter.ts';
import { createWorkerMastodonFallbackRouter } from '../../workerMastodonFallbackRouter.ts';
import { createWorkerMastodonMarkersRouter } from '../../workerMastodonMarkersRouter.ts';
import { createWorkerMastodonNotificationsRouter } from '../../workerMastodonNotificationsRouter.ts';
import { createWorkerMastodonStatusesRouter } from '../../workerMastodonStatusesRouter.ts';
import { createWorkerMastodonTimelinesRouter } from '../../workerMastodonTimelinesRouter.ts';
import { createWorkerMastodonViewerListsRouter } from '../../workerMastodonViewerListsRouter.ts';
import { createOAuthHarness, ORIGIN } from './oauthHarness.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

export const setupReadApi = (
  options: Readonly<{
    textGenerator?: TextGenerator;
    searchTimeline?: Partial<Parameters<typeof createSearchTimelineUseCase>[0]>;
  }> = {},
) => {
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
  const markersResolverByUserId = createD1MarkersResolverByUserId(db);
  const sessionResolver = harness.memory.sessionResolver as never;
  const userResolver = createD1UserResolver(db);
  const postResolver = createD1PostResolver(db);
  const repostResolver = createD1RepostResolver(db);
  const timelineItemCreatedStore = createD1TimelineItemCreatedStore(db);
  const notificationResolverByUserIdAndId = createD1NotificationResolverByUserIdAndId(db);
  const notificationsResolverByPage = createD1NotificationsResolverByPage(db);
  const remoteActorCreatedStore = createD1RemoteActorCreatedStore(db);
  const logoUriUpdatedStore = createD1LogoUriUpdatedStore(db);
  const actorResolverByUri = createD1ActorResolverByUri(db);
  const federation = {
    sendActivity: vi.fn(async () => undefined),
    getActorUri: (username: string) => new URL(`${ORIGIN}/users/${username}`),
    getDocumentLoader: vi.fn(async () => ({})),
    lookupObject: vi.fn(async (): Promise<unknown> => null),
  };
  const createContext = () => federation as never;
  const remoteActorLookup = {
    lookup: vi.fn((): RA<never, never> =>
      RA.err({
        type: 'RemoteActorLookupError',
        message: 'not found',
        detail: { handle: '', reason: 'not found' },
      } as never)
    ),
  };
  const remoteActorActions = createWorkerRemoteActorActions({
    userResolver,
    actorResolverByUserId,
    actorResolverById: createD1ActorResolverById(db),
    followResolver: createD1FollowResolver(db),
    followRequestedStore: createD1FollowRequestedStore(db),
    undoFollowingProcessedStore: createD1UndoFollowingProcessedStore(db),
  });
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
          repostResolver,
          threadResolver: createD1ThreadResolver(db, ORIGIN),
          statusAssembler,
          sendLikeUseCase: SendLikeUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            localLikeCreatedStore: createD1LocalLikeCreatedStore(db),
            likeResolver: createD1LikeResolver(db),
            postResolver,
          }),
          undoLikeUseCase: UndoLikeUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            likeResolver: createD1LikeResolver(db),
            localLikeDeletedStore: createD1LocalLikeDeletedStore(db),
            postResolver,
          }),
          sendRepostUseCase: SendRepostUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            repostCreatedStore: createD1RepostCreatedStore(db),
            repostResolver,
            remotePostUpserter: createD1RemotePostUpserter({
              postResolverByUri: createD1PostResolverByUri(db),
              postCreatedStore: createD1PostCreatedStore(db),
              postImageCreatedStore: createD1PostImageCreatedStore(db),
              remoteActorCreatedStore,
              logoUriUpdatedStore,
              actorResolverByUri,
            }),
            timelineItemCreatedStore,
            postResolver,
          }),
          undoRepostUseCase: UndoRepostUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            repostResolver,
            repostDeletedStore: createD1RepostDeletedStore(db),
            timelineItemResolverByRepostId: createD1TimelineItemResolverByRepostId(db),
            timelineItemDeletedStore: createD1TimelineItemDeletedStore(db),
            postResolver,
          }),
          createContext,
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
          actorIdResolverByAcct: createD1ActorIdResolverByAcct(db),
          accountRelationshipsResolverByActorIds: createD1AccountRelationshipsResolverByActorIds(db),
          statusAssembler,
          createMuteUseCase: CreateMuteUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            muteCreatedStore: createD1MuteCreatedStore(db),
            muteResolver: createD1MuteResolver(db),
          }),
          deleteMuteUseCase: DeleteMuteUseCase.create({
            sessionResolver,
            userResolver,
            muteDeletedStore: createD1MuteDeletedStore(db),
            muteResolver: createD1MuteResolver(db),
          }),
          followRemoteActor: remoteActorActions.followRemoteActor,
          unfollowRemoteActor: remoteActorActions.unfollowRemoteActor,
          createContext,
        }),
      );
      root.route(
        '/api',
        createWorkerMastodonViewerListsRouter({
          authn,
          actorResolverByUserId,
          likedPostIdsResolverByActorIdWithPagination: createD1LikedPostIdsResolverByActorIdWithPagination(db),
          mutedActorsResolverByUserIdWithPagination: createD1MutedActorsResolverByUserIdWithPagination(db),
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          statusAssembler,
        }),
      );
      root.route(
        '/api',
        createWorkerIoriSearchRouter({
          authn,
          searchTimeline: createSearchTimelineUseCase({
            actorResolverByUserId,
            actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
            mutedActorIdsResolverByUserId: createD1MutedActorIdsResolverByUserId(db),
            textGenerator: options.textGenerator,
            timelineSearchCandidatesResolver: createD1TimelineSearchCandidatesResolver(db),
            htmlToPlainText,
            ...options.searchTimeline,
          }),
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          statusAssembler,
          resolveRemoteAccountUseCase: ResolveRemoteAccountUseCase.create({
            userResolver,
            remoteActorLookup,
            remoteActorCreatedStore,
            logoUriUpdatedStore,
            actorResolverByUri,
          }),
        }),
      );
      root.route(
        '/api',
        createWorkerMastodonNotificationsRouter({
          authn,
          actorResolverByUserId,
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          statusAssembler,
          notificationsResolverByPage,
          notificationResolverByUserIdAndId,
          notificationCountResolverSinceMarker: createD1NotificationCountResolverSinceMarker(db),
          dismissNotificationUseCase: DismissNotificationUseCase.create({
            notificationResolverByUserIdAndId,
            notificationDismissedStore: createD1NotificationDismissedStore(db),
          }),
          clearNotificationsUseCase: ClearNotificationsUseCase.create({
            notificationsResolverByPage,
            notificationsClearedStore: createD1NotificationsClearedStore(db),
          }),
        }),
      );
      root.route(
        '/api',
        createWorkerMastodonMarkersRouter({
          authn,
          markersResolverByUserId,
          saveMarkersUseCase: SaveMarkersUseCase.create({
            markersResolverByUserId,
            markerSavedStore: createD1MarkerSavedStore(db),
          }),
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

  return {
    ...harness,
    seed,
    request,
    signIn,
    bearerFor,
    federation,
    remoteActorLookup,
    queries: fixture.queries,
    sqlite: fixture.sqlite,
  };
};

export const idsOf = (body: unknown): string[] => (body as ReadonlyArray<{ id: string }>).map((item) => item.id);

export const linkOf = (response: Response, rel: 'next' | 'prev'): URL | undefined => {
  const header = response.headers.get('Link');
  const match = header === null ? null : new RegExp(`<([^>]+)>; rel="${rel}"`).exec(header);
  return match === null ? undefined : new URL(match[1]!);
};
