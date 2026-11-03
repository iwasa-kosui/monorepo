import { createD1AccountProfilesResolverByActorIds } from '../adaptor/d1/actor/accountProfilesResolverByActorIds.ts';
import { createD1AccountStatsResolverByActorId } from '../adaptor/d1/actor/accountStatsResolverByActorId.ts';
import { createD1ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import { createD1ActorResolverByUri } from '../adaptor/d1/actor/actorResolverByUri.ts';
import { createD1ActorResolverByUserId } from '../adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowerId } from '../adaptor/d1/actor/actorsResolverByFollowerId.ts';
import { createD1ActorsResolverByFollowingId } from '../adaptor/d1/actor/actorsResolverByFollowingId.ts';
import { createD1LocalActorCreatedStore } from '../adaptor/d1/actor/localActorCreatedStore.ts';
import { createD1LogoUriUpdatedStore } from '../adaptor/d1/actor/logoUriUpdatedStore.ts';
import { createD1RemoteActorCreatedStore } from '../adaptor/d1/actor/remoteActorCreatedStore.ts';
import { createD1ArticleCreatedStore } from '../adaptor/d1/article/articleCreatedStore.ts';
import { createD1ArticleDeletedStore } from '../adaptor/d1/article/articleDeletedStore.ts';
import { createD1ArticlePublishedStore } from '../adaptor/d1/article/articlePublishedStore.ts';
import { createD1ArticleResolver } from '../adaptor/d1/article/articleResolver.ts';
import { createD1ArticleResolverByRootPostId } from '../adaptor/d1/article/articleResolverByRootPostId.ts';
import { createD1ArticlesResolverByAuthorActorId } from '../adaptor/d1/article/articlesResolverByAuthorActorId.ts';
import { createD1ArticleUnpublishedStore } from '../adaptor/d1/article/articleUnpublishedStore.ts';
import { createD1PublishedArticlesWithAuthorResolver } from '../adaptor/d1/article/publishedArticlesWithAuthorResolver.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1EmojiReactCreatedStore } from '../adaptor/d1/emojiReact/emojiReactCreatedStore.ts';
import { createD1EmojiReactDeletedStore } from '../adaptor/d1/emojiReact/emojiReactDeletedStore.ts';
import { createD1EmojiReactResolverByActorAndPostAndEmoji } from '../adaptor/d1/emojiReact/emojiReactResolverByActorAndPostAndEmoji.ts';
import { createD1FederatedTimelineItemsResolver } from '../adaptor/d1/federatedTimeline/federatedTimelineItemsResolver.ts';
import {
  createD1ActorIdsResolverByFollowerIdWithPagination,
  createD1ActorIdsResolverByFollowingIdWithPagination,
} from '../adaptor/d1/follow/actorIdsResolverByFollowsWithPagination.ts';
import { createD1FollowRequestedStore } from '../adaptor/d1/follow/followRequestedStore.ts';
import { createD1FollowResolver } from '../adaptor/d1/follow/followResolver.ts';
import { createD1UndoFollowingProcessedStore } from '../adaptor/d1/follow/undoFollowingProcessedStore.ts';
import { createD1PostImageCreatedStore } from '../adaptor/d1/image/postImageCreatedStore.ts';
import { createD1LikedPostsResolverByActorId } from '../adaptor/d1/like/likedPostsResolverByActorId.ts';
import { createD1LikeResolver } from '../adaptor/d1/like/likeResolver.ts';
import { createD1LocalLikeCreatedStore } from '../adaptor/d1/like/localLikeCreatedStore.ts';
import { createD1LocalLikeDeletedStore } from '../adaptor/d1/like/localLikeDeletedStore.ts';
import { createD1LinkPreviewCreatedStore } from '../adaptor/d1/linkPreview/linkPreviewCreatedStore.ts';
import { createD1MarkerSavedStore } from '../adaptor/d1/marker/markerSavedStore.ts';
import { createD1MarkersResolverByUserId } from '../adaptor/d1/marker/markersResolverByUserId.ts';
import { createD1MuteCreatedStore } from '../adaptor/d1/mute/muteCreatedStore.ts';
import { createD1MutedActorIdsResolverByUserId } from '../adaptor/d1/mute/mutedActorIdsResolverByUserId.ts';
import { createD1MuteDeletedStore } from '../adaptor/d1/mute/muteDeletedStore.ts';
import { createD1MuteResolver } from '../adaptor/d1/mute/muteResolver.ts';
import { createD1MutesResolverByUserId } from '../adaptor/d1/mute/mutesResolverByUserId.ts';
import { createD1ReplyNotificationCreatedStore } from '../adaptor/d1/notification/inboxNotificationAdapters.ts';
import { createD1NotificationCountResolverSinceMarker } from '../adaptor/d1/notification/notificationCountResolverSinceMarker.ts';
import { createD1NotificationResolverByUserIdAndId } from '../adaptor/d1/notification/notificationResolverByUserIdAndId.ts';
import { createD1NotificationsResolverByPage } from '../adaptor/d1/notification/notificationsResolverByPage.ts';
import { createD1AccessTokenIssuedStore } from '../adaptor/d1/oauth/accessTokenIssuedStore.ts';
import {
  createD1AccessTokenResolverByTokenHash,
  createD1AccessTokensResolverByAuthorizationCodeHash,
  createD1AccessTokenUsageRecorder,
} from '../adaptor/d1/oauth/accessTokenResolvers.ts';
import { createD1AccessTokenRevokedStore } from '../adaptor/d1/oauth/accessTokenRevokedStore.ts';
import { createD1AuthorizationCodeConsumedStore } from '../adaptor/d1/oauth/authorizationCodeConsumedStore.ts';
import { createD1AuthorizationCodeIssuedStore } from '../adaptor/d1/oauth/authorizationCodeIssuedStore.ts';
import { createD1AuthorizationCodeResolverByCodeHash } from '../adaptor/d1/oauth/authorizationCodeResolverByCodeHash.ts';
import { createD1OAuthApplicationRegisteredStore } from '../adaptor/d1/oauth/oauthApplicationRegisteredStore.ts';
import {
  createD1OAuthApplicationResolver,
  createD1OAuthApplicationResolverByClientId,
} from '../adaptor/d1/oauth/oauthApplicationResolvers.ts';
import { createD1AccountStatusItemsResolverByActorId } from '../adaptor/d1/post/accountStatusItemsResolverByActorId.ts';
import { createD1LocalPostResolverByUri } from '../adaptor/d1/post/localPostResolverByUri.ts';
import { createD1LocalPostsResolverByPage } from '../adaptor/d1/post/localPostsResolverByPage.ts';
import { createD1PostCreatedStore } from '../adaptor/d1/post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../adaptor/d1/post/postDeletedStore.ts';
import { createD1PostExtrasResolverByPosts } from '../adaptor/d1/post/postExtrasResolverByPosts.ts';
import { createD1PostResolver } from '../adaptor/d1/post/postResolver.ts';
import { createD1PostResolverByUri } from '../adaptor/d1/post/postResolverByUri.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../adaptor/d1/post/postWithAuthorBatch.ts';
import {
  createD1PostsResolverByActorIds,
  createD1PostsResolverByActorIdWithPagination,
} from '../adaptor/d1/post/postWithAuthorResolvers.ts';
import { createD1RemotePostUpserter } from '../adaptor/d1/post/remotePostUpserter.ts';
import { createD1ThreadResolver } from '../adaptor/d1/post/threadResolver.ts';
import { createD1PushSubscriptionCreatedStore } from '../adaptor/d1/pushSubscription/pushSubscriptionCreatedStore.ts';
import { createD1PushSubscriptionDeletedStore } from '../adaptor/d1/pushSubscription/pushSubscriptionDeletedStore.ts';
import { createD1PushSubscriptionResolverByEndpoint } from '../adaptor/d1/pushSubscription/pushSubscriptionResolverByEndpoint.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1AcceptedRelaysResolver } from '../adaptor/d1/relay/acceptedRelaysResolver.ts';
import { createD1AllRelaysResolver } from '../adaptor/d1/relay/allRelaysResolver.ts';
import { createD1RelayResolverByActorUri } from '../adaptor/d1/relay/relayResolverByActorUri.ts';
import { createD1RelaySubscriptionRequestedStore } from '../adaptor/d1/relay/relaySubscriptionRequestedStore.ts';
import { createD1RepostCreatedStore } from '../adaptor/d1/repost/repostCreatedStore.ts';
import { createD1RepostDeletedStore } from '../adaptor/d1/repost/repostDeletedStore.ts';
import { createD1RepostResolver } from '../adaptor/d1/repost/repostResolver.ts';
import { createD1RepostResolverById } from '../adaptor/d1/repost/repostResolverById.ts';
import { createD1SessionResolver } from '../adaptor/d1/session/sessionResolver.ts';
import { createD1SessionStartedStore } from '../adaptor/d1/session/sessionStartedStore.ts';
import { createD1SessionWithUserAndActorResolver } from '../adaptor/d1/session/sessionWithUserAndActorResolver.ts';
import { createD1TimelineItemCreatedStore } from '../adaptor/d1/timeline/timelineItemCreatedStore.ts';
import { createD1TimelineItemDeletedStore } from '../adaptor/d1/timeline/timelineItemDeletedStore.ts';
import { createD1TimelineItemResolverByRepostId } from '../adaptor/d1/timeline/timelineItemResolverByRepostId.ts';
import { createD1TimelineItemsResolverByActorIds } from '../adaptor/d1/timeline/timelineItemsResolverByActorIds.ts';
import { createD1UserCreatedStore } from '../adaptor/d1/user/userCreatedStore.ts';
import { createD1UserResolver } from '../adaptor/d1/user/userResolver.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createD1UserWithLocalActorResolverByUsername } from '../adaptor/d1/user/userWithLocalActorResolverByUsername.ts';
import { createD1UserPasswordResolver } from '../adaptor/d1/userPassword/userPasswordResolver.ts';
import { createD1UserPasswordSetStore } from '../adaptor/d1/userPassword/userPasswordSetStore.ts';
import { createCloudflareRemoteActorLookup } from '../adaptor/fedify/cloudflareRemoteActorLookup.ts';
import { createStatusAssembler } from '../adaptor/mastodon/statusAssembler.ts';
import { createOgpFetcher } from '../adaptor/ogp/ogpFetcher.ts';
import { createR2OgImageStore } from '../adaptor/r2/ogImageStore.ts';
import { createPostImageR2ObjectStore } from '../adaptor/r2/postImageObjectStore.ts';
import { createCloudflareWebPushSender } from '../adaptor/webPush/cloudflareWebPushSender.ts';
import { createWorkersAiEmbedder } from '../adaptor/workersAi/workersAiEmbedder.ts';
import type { WorkersAiRunner } from '../adaptor/workersAi/workersAiRunner.ts';
import { createWorkersAiTextGenerator } from '../adaptor/workersAi/workersAiTextGenerator.ts';
import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import { createCloudflareFederationRuntime, type WaitUntil } from '../federation.cloudflare.ts';
import { CreateArticleUseCase } from '../useCase/createArticle.ts';
import { CreateMuteUseCase } from '../useCase/createMute.ts';
import { createCreatePostUseCase } from '../useCase/createPost.ts';
import { DeleteArticleUseCase } from '../useCase/deleteArticle.ts';
import { DeleteMuteUseCase } from '../useCase/deleteMute.ts';
import { DeletePostUseCase } from '../useCase/deletePost.ts';
import { ExchangeTokenUseCase } from '../useCase/exchangeToken.ts';
import { GetArticlesUseCase } from '../useCase/getArticles.ts';
import { GetArticleWithThreadUseCase } from '../useCase/getArticleWithThread.ts';
import { GetLikedPostsUseCase } from '../useCase/getLikedPosts.ts';
import { GetMutesUseCase } from '../useCase/getMutes.ts';
import { createGetTimelineUseCase } from '../useCase/getTimeline.ts';
import { IssueAuthorizationCodeUseCase } from '../useCase/issueAuthorizationCode.ts';
import { PublishArticleUseCase } from '../useCase/publishArticle.ts';
import { RegisterOAuthApplicationUseCase } from '../useCase/registerOAuthApplication.ts';
import { RevokeTokenUseCase } from '../useCase/revokeToken.ts';
import { SaveMarkersUseCase } from '../useCase/saveMarkers.ts';
import { SendEmojiReactUseCase } from '../useCase/sendEmojiReact.ts';
import { SendFollowRequestUseCase } from '../useCase/sendFollowRequest.ts';
import { SendLikeUseCase } from '../useCase/sendLike.ts';
import { SendReplyUseCase } from '../useCase/sendReply.ts';
import { SendRepostUseCase } from '../useCase/sendRepost.ts';
import { createSignInUseCase } from '../useCase/signIn.ts';
import { createSignUpUseCase } from '../useCase/signUp.ts';
import { SubscribePushUseCase } from '../useCase/subscribePush.ts';
import { SubscribeRelayUseCase } from '../useCase/subscribeRelay.ts';
import { UndoEmojiReactUseCase } from '../useCase/undoEmojiReact.ts';
import { UndoLikeUseCase } from '../useCase/undoLike.ts';
import { UndoRepostUseCase } from '../useCase/undoRepost.ts';
import { UnpublishArticleUseCase } from '../useCase/unpublishArticle.ts';
import { UnsubscribePushUseCase } from '../useCase/unsubscribePush.ts';
import { ValidateAuthorizationRequestUseCase } from '../useCase/validateAuthorizationRequest.ts';
import { VerifyAccessTokenUseCase } from '../useCase/verifyAccessToken.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { WorkerRuntimePorts } from './ports.ts';
import {
  createWorkerGetRemoteActorPostsUseCase,
  createWorkerGetUserPostsUseCase,
  createWorkerRemoteActorActions,
} from './workerCoreUseCases.ts';

const lazyWorkerArgon2idDerive: Argon2idDerive = async (params) => {
  const { workerArgon2idDerive } = await import('../adaptor/argon2/workerArgon2idDerive.ts');
  return workerArgon2idDerive(params);
};

export const createWorkerRuntimePorts = async (
  env: IoriWorkerEnv,
  waitUntil: WaitUntil,
): Promise<WorkerRuntimePorts> => {
  const federationRuntime = await createCloudflareFederationRuntime(env, waitUntil);
  const db = createD1Db(env.DB);
  const workersAi = env.AI as unknown as WorkersAiRunner | undefined;
  const sessionResolver = createD1SessionResolver(db);
  const sessionWithUserAndActorResolver = createD1SessionWithUserAndActorResolver(db);
  const userResolver = createD1UserResolver(db);
  const actorResolverByUserId = createD1ActorResolverByUserId(db);
  const markersResolverByUserId = createD1MarkersResolverByUserId(db);
  const postResolver = createD1PostResolver(db);
  const postCreatedStore = createD1PostCreatedStore(db);
  const timelineItemCreatedStore = createD1TimelineItemCreatedStore(db);
  const articleResolver = createD1ArticleResolver(db);
  const likeResolver = createD1LikeResolver(db);
  const repostResolver = createD1RepostResolver(db);
  const emojiReactResolverByActorAndPostAndEmoji = createD1EmojiReactResolverByActorAndPostAndEmoji(db);
  const threadResolver = createD1ThreadResolver(db, env.ORIGIN);
  const uploads = createPostImageR2ObjectStore({ bucket: env.UPLOADS });
  const ogImageStore = createR2OgImageStore(env.UPLOADS);
  const pushSubscriptionsResolver = createD1PushSubscriptionsResolverByUserId(db);
  const webPushSender = createCloudflareWebPushSender({
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  });
  const remotePostUpserter = createD1RemotePostUpserter({
    postResolverByUri: createD1PostResolverByUri(db),
    postCreatedStore,
    postImageCreatedStore: createD1PostImageCreatedStore(db),
    remoteActorCreatedStore: createD1RemoteActorCreatedStore(db),
    logoUriUpdatedStore: createD1LogoUriUpdatedStore(db),
    actorResolverByUri: createD1ActorResolverByUri(db),
  });
  const oauthApplicationResolverByClientId = createD1OAuthApplicationResolverByClientId(db);
  const accessTokenResolverByTokenHash = createD1AccessTokenResolverByTokenHash(db);
  const accessTokenRevokedStore = createD1AccessTokenRevokedStore(db);
  const authorizationCodeResolverByCodeHash = createD1AuthorizationCodeResolverByCodeHash(db);
  const remoteActorActions = createWorkerRemoteActorActions({
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    sessionWithUserAndActorResolver,
    actorResolverById: createD1ActorResolverById(db),
    followResolver: createD1FollowResolver(db),
    followRequestedStore: createD1FollowRequestedStore(db),
    undoFollowingProcessedStore: createD1UndoFollowingProcessedStore(db),
  });

  return {
    db,
    auth: {
      signInUseCase: createSignInUseCase({
        userResolverByUsername: createD1UserResolverByUsername(db),
        userPasswordResolver: createD1UserPasswordResolver(db),
        sessionStartedStore: createD1SessionStartedStore(db),
        argon2idDerive: lazyWorkerArgon2idDerive,
      }),
    },
    oauth: {
      registerOAuthApplicationUseCase: RegisterOAuthApplicationUseCase.create({
        oauthApplicationRegisteredStore: createD1OAuthApplicationRegisteredStore(db),
      }),
      validateAuthorizationRequestUseCase: ValidateAuthorizationRequestUseCase.create({
        oauthApplicationResolverByClientId,
      }),
      issueAuthorizationCodeUseCase: IssueAuthorizationCodeUseCase.create({
        sessionResolver,
        oauthApplicationResolverByClientId,
        authorizationCodeIssuedStore: createD1AuthorizationCodeIssuedStore(db),
      }),
      exchangeTokenUseCase: ExchangeTokenUseCase.create({
        oauthApplicationResolverByClientId,
        authorizationCodeResolverByCodeHash,
        authorizationCodeConsumedStore: createD1AuthorizationCodeConsumedStore(db),
        accessTokenIssuedStore: createD1AccessTokenIssuedStore(db),
        accessTokenRevokedStore,
        accessTokensResolverByAuthorizationCodeHash: createD1AccessTokensResolverByAuthorizationCodeHash(db),
      }),
      revokeTokenUseCase: RevokeTokenUseCase.create({
        oauthApplicationResolverByClientId,
        accessTokenResolverByTokenHash,
        accessTokenRevokedStore,
      }),
      verifyAccessTokenUseCase: VerifyAccessTokenUseCase.create({
        accessTokenResolverByTokenHash,
        accessTokenUsageRecorder: createD1AccessTokenUsageRecorder(db),
      }),
      oauthApplicationResolver: createD1OAuthApplicationResolver(db),
      sessionResolver,
    },
    mastodon: {
      userResolver,
      userResolverByUsername: createD1UserResolverByUsername(db),
      actorResolverByUserId,
      actorResolverById: createD1ActorResolverById(db),
      accountStatsResolver: createD1AccountStatsResolverByActorId(db),
      actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
      mutedActorIdsResolverByUserId: createD1MutedActorIdsResolverByUserId(db),
      timelineItemsResolverByActorIds: createD1TimelineItemsResolverByActorIds(db),
      localPostsResolverByPage: createD1LocalPostsResolverByPage(db),
      accountStatusItemsResolverByActorId: createD1AccountStatusItemsResolverByActorId(db),
      federatedTimelineItemsResolver: createD1FederatedTimelineItemsResolver(db),
      postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
      repostResolverById: createD1RepostResolverById(db),
      threadResolver,
      actorIdsResolverByFollowerId: createD1ActorIdsResolverByFollowerIdWithPagination(db),
      actorIdsResolverByFollowingId: createD1ActorIdsResolverByFollowingIdWithPagination(db),
      statusAssembler: createStatusAssembler({
        accountProfilesResolver: createD1AccountProfilesResolverByActorIds(db),
        postExtrasResolver: createD1PostExtrasResolverByPosts(db, env.ORIGIN),
      }),
      notificationsResolverByPage: createD1NotificationsResolverByPage(db),
      notificationResolverByUserIdAndId: createD1NotificationResolverByUserIdAndId(db),
      notificationCountResolverSinceMarker: createD1NotificationCountResolverSinceMarker(db),
      markersResolverByUserId,
      saveMarkersUseCase: SaveMarkersUseCase.create({
        markersResolverByUserId,
        markerSavedStore: createD1MarkerSavedStore(db),
      }),
    },
    timeline: {
      getTimelineUseCase: createGetTimelineUseCase({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        sessionWithUserAndActorResolver,
        timelineItemsResolverByActorIds: createD1TimelineItemsResolverByActorIds(db),
        actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
        actorsResolverByFollowingId: createD1ActorsResolverByFollowingId(db),
        mutedActorIdsResolverByUserId: createD1MutedActorIdsResolverByUserId(db),
      }),
    },
    posting: {
      createPostUseCase: createCreatePostUseCase({
        sessionResolver,
        postCreatedStore,
        userResolver,
        actorResolverByUserId,
        postImageCreatedStore: createD1PostImageCreatedStore(db),
        timelineItemCreatedStore,
        linkPreviewCreatedStore: createD1LinkPreviewCreatedStore(db),
        ogpFetcher: createOgpFetcher(),
        acceptedRelaysResolver: createD1AcceptedRelaysResolver(db),
        origin: env.ORIGIN,
      }),
    },
    socialActions: {
      sendLikeUseCase: SendLikeUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        localLikeCreatedStore: createD1LocalLikeCreatedStore(db),
        likeResolver,
        postResolver,
      }),
      undoLikeUseCase: UndoLikeUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        likeResolver,
        localLikeDeletedStore: createD1LocalLikeDeletedStore(db),
        postResolver,
      }),
      sendRepostUseCase: SendRepostUseCase.create({
        origin: env.ORIGIN,
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        repostCreatedStore: createD1RepostCreatedStore(db),
        repostResolver,
        remotePostUpserter,
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
      sendEmojiReactUseCase: SendEmojiReactUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        emojiReactCreatedStore: createD1EmojiReactCreatedStore(db),
        emojiReactResolverByActorAndPostAndEmoji,
        postResolver,
      }),
      undoEmojiReactUseCase: UndoEmojiReactUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        emojiReactDeletedStore: createD1EmojiReactDeletedStore(db),
        emojiReactResolverByActorAndPostAndEmoji,
        postResolver,
      }),
    },
    notifications: {
      getLikedPostsUseCase: GetLikedPostsUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        sessionWithUserAndActorResolver,
        likedPostsResolver: createD1LikedPostsResolverByActorId(db),
      }),
    },
    articles: {
      getArticleWithThreadUseCase: GetArticleWithThreadUseCase.create({
        articleResolver,
        threadResolver: createD1ThreadResolver(db, env.ORIGIN),
      }),
      getArticlesUseCase: GetArticlesUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        articlesResolverByAuthorActorId: createD1ArticlesResolverByAuthorActorId(db),
      }),
      createArticleUseCase: CreateArticleUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        postResolver,
        articleResolverByRootPostId: createD1ArticleResolverByRootPostId(db),
        articleCreatedStore: createD1ArticleCreatedStore(db),
      }),
      publishArticleUseCase: PublishArticleUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        articleResolver,
        articlePublishedStore: createD1ArticlePublishedStore(db),
      }),
      unpublishArticleUseCase: UnpublishArticleUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        articleResolver,
        articleUnpublishedStore: createD1ArticleUnpublishedStore(db),
      }),
      deleteArticleUseCase: DeleteArticleUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        articleResolver,
        articleDeletedStore: createD1ArticleDeletedStore(db),
      }),
      publishedArticlesResolver: createD1PublishedArticlesWithAuthorResolver(db),
      sessionResolver,
      // OGP images are generated on first request by serveOgImage and cached in R2.
      publishOgImage: async () => undefined,
      deleteOgImage: (articleId) => ogImageStore.delete(articleId),
    },
    mutesRelays: {
      getMutesUseCase: GetMutesUseCase.create({
        sessionResolver,
        userResolver,
        mutesResolverByUserId: createD1MutesResolverByUserId(db),
      }),
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
      subscribeRelayUseCase: SubscribeRelayUseCase.create({
        relayResolverByActorUri: createD1RelayResolverByActorUri(db),
        relaySubscriptionRequestedStore: createD1RelaySubscriptionRequestedStore(db),
      }),
      allRelaysResolver: createD1AllRelaysResolver(db),
    },
    core: {
      signUpUseCase: createSignUpUseCase({
        userResolverByUsername: createD1UserResolverByUsername(db),
        userCreatedStore: createD1UserCreatedStore(db),
        localActorCreatedStore: createD1LocalActorCreatedStore(db),
        userPasswordSetStore: createD1UserPasswordSetStore(db),
        argon2idDerive: lazyWorkerArgon2idDerive,
      }),
      sendReplyUseCase: SendReplyUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        postCreatedStore,
        postImageCreatedStore: createD1PostImageCreatedStore(db),
        timelineItemCreatedStore,
        localPostResolverByUri: createD1LocalPostResolverByUri(db, env.ORIGIN),
        replyNotificationCreatedStore: createD1ReplyNotificationCreatedStore(db),
        pushSubscriptionsResolver,
        webPushSender,
        postResolver,
        origin: env.ORIGIN,
      }),
      deletePostUseCase: DeletePostUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        postResolver,
        postDeletedStore: createD1PostDeletedStore(db),
        articleResolverByRootPostId: createD1ArticleResolverByRootPostId(db),
        articleDeletedStore: createD1ArticleDeletedStore(db),
      }),
      sendFollowRequestUseCase: SendFollowRequestUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        remoteActorLookup: createCloudflareRemoteActorLookup(federationRuntime.federation),
        followRequestedStore: createD1FollowRequestedStore(db),
        remoteActorCreatedStore: createD1RemoteActorCreatedStore(db),
        logoUriUpdatedStore: createD1LogoUriUpdatedStore(db),
        actorResolverByUri: createD1ActorResolverByUri(db),
      }),
      getUserPostsUseCase: createWorkerGetUserPostsUseCase({
        userWithLocalActorResolverByUsername: createD1UserWithLocalActorResolverByUsername(db),
        actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
        actorsResolverByFollowingId: createD1ActorsResolverByFollowingId(db),
        postsResolverByActorIds: createD1PostsResolverByActorIds(db, env.ORIGIN),
      }),
      getRemoteActorPostsUseCase: createWorkerGetRemoteActorPostsUseCase({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        sessionWithUserAndActorResolver,
        actorResolverById: createD1ActorResolverById(db),
        followResolver: createD1FollowResolver(db),
        muteResolver: createD1MuteResolver(db),
        postsResolverByActorIdWithPagination: createD1PostsResolverByActorIdWithPagination(db, env.ORIGIN),
      }),
      subscribePushUseCase: SubscribePushUseCase.create({
        sessionResolver,
        userResolver,
        pushSubscriptionCreatedStore: createD1PushSubscriptionCreatedStore(db),
        pushSubscriptionResolverByEndpoint: createD1PushSubscriptionResolverByEndpoint(db),
      }),
      unsubscribePushUseCase: UnsubscribePushUseCase.create({
        sessionResolver,
        userResolver,
        pushSubscriptionDeletedStore: createD1PushSubscriptionDeletedStore(db),
        pushSubscriptionResolverByEndpoint: createD1PushSubscriptionResolverByEndpoint(db),
      }),
      ...remoteActorActions,
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
    },
    uploads,
    federation: federationRuntime.federation,
    textGenerator: workersAi === undefined ? undefined : createWorkersAiTextGenerator(workersAi),
    textEmbedder: workersAi === undefined ? undefined : createWorkersAiEmbedder(workersAi),
  };
};
