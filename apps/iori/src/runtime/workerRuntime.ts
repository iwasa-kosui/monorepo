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
import { createD1FollowRequestedStore } from '../adaptor/d1/follow/followRequestedStore.ts';
import { createD1FollowResolver } from '../adaptor/d1/follow/followResolver.ts';
import { createD1UndoFollowingProcessedStore } from '../adaptor/d1/follow/undoFollowingProcessedStore.ts';
import { createD1PostImageCreatedStore } from '../adaptor/d1/image/postImageCreatedStore.ts';
import { createD1LikedPostsResolverByActorId } from '../adaptor/d1/like/likedPostsResolverByActorId.ts';
import { createD1LikeResolver } from '../adaptor/d1/like/likeResolver.ts';
import { createD1LocalLikeCreatedStore } from '../adaptor/d1/like/localLikeCreatedStore.ts';
import { createD1LocalLikeDeletedStore } from '../adaptor/d1/like/localLikeDeletedStore.ts';
import { createD1LinkPreviewCreatedStore } from '../adaptor/d1/linkPreview/linkPreviewCreatedStore.ts';
import { createD1MuteCreatedStore } from '../adaptor/d1/mute/muteCreatedStore.ts';
import { createD1MutedActorIdsResolverByUserId } from '../adaptor/d1/mute/mutedActorIdsResolverByUserId.ts';
import { createD1MuteDeletedStore } from '../adaptor/d1/mute/muteDeletedStore.ts';
import { createD1MuteResolver } from '../adaptor/d1/mute/muteResolver.ts';
import { createD1MutesResolverByUserId } from '../adaptor/d1/mute/mutesResolverByUserId.ts';
import { createD1ReplyNotificationCreatedStore } from '../adaptor/d1/notification/inboxNotificationAdapters.ts';
import { createD1NotificationsReadStore } from '../adaptor/d1/notification/notificationsReadStore.ts';
import { createD1NotificationsResolverByUserId } from '../adaptor/d1/notification/notificationsResolverByUserId.ts';
import { createD1UnreadNotificationCountResolverByUserId } from '../adaptor/d1/notification/unreadNotificationCountResolverByUserId.ts';
import { createD1LocalPostResolverByUri } from '../adaptor/d1/post/localPostResolverByUri.ts';
import { createD1PostCreatedStore } from '../adaptor/d1/post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../adaptor/d1/post/postDeletedStore.ts';
import { createD1PostResolver } from '../adaptor/d1/post/postResolver.ts';
import { createD1PostResolverByUri } from '../adaptor/d1/post/postResolverByUri.ts';
import {
  createD1LocalPostsResolver,
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
import { createD1SessionResolver } from '../adaptor/d1/session/sessionResolver.ts';
import { createD1SessionStartedStore } from '../adaptor/d1/session/sessionStartedStore.ts';
import { createD1TimelineItemCreatedStore } from '../adaptor/d1/timeline/timelineItemCreatedStore.ts';
import { createD1TimelineItemDeletedStore } from '../adaptor/d1/timeline/timelineItemDeletedStore.ts';
import { createD1TimelineItemResolverByRepostId } from '../adaptor/d1/timeline/timelineItemResolverByRepostId.ts';
import { createD1TimelineItemsResolverByActorIds } from '../adaptor/d1/timeline/timelineItemsResolverByActorIds.ts';
import { createD1UserCreatedStore } from '../adaptor/d1/user/userCreatedStore.ts';
import { createD1UserResolver } from '../adaptor/d1/user/userResolver.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createD1UserPasswordResolver } from '../adaptor/d1/userPassword/userPasswordResolver.ts';
import { createD1UserPasswordSetStore } from '../adaptor/d1/userPassword/userPasswordSetStore.ts';
import { createCloudflareRemoteActorLookup } from '../adaptor/fedify/cloudflareRemoteActorLookup.ts';
import { createOgpFetcher } from '../adaptor/ogp/ogpFetcher.ts';
import { createPostImageR2ObjectStore } from '../adaptor/r2/postImageObjectStore.ts';
import { createCloudflareWebPushSender } from '../adaptor/webPush/cloudflareWebPushSender.ts';
import { createCloudflareFederationRuntime } from '../federation.cloudflare.ts';
import { CreateArticleUseCase } from '../useCase/createArticle.ts';
import { CreateMuteUseCase } from '../useCase/createMute.ts';
import { createCreatePostUseCase } from '../useCase/createPost.ts';
import { DeleteArticleUseCase } from '../useCase/deleteArticle.ts';
import { DeleteMuteUseCase } from '../useCase/deleteMute.ts';
import { DeletePostUseCase } from '../useCase/deletePost.ts';
import { GetArticlesUseCase } from '../useCase/getArticles.ts';
import { GetArticleWithThreadUseCase } from '../useCase/getArticleWithThread.ts';
import { GetFederatedTimelineUseCase } from '../useCase/getFederatedTimeline.ts';
import { GetLikedPostsUseCase } from '../useCase/getLikedPosts.ts';
import { GetMutesUseCase } from '../useCase/getMutes.ts';
import { GetNotificationsUseCase } from '../useCase/getNotifications.ts';
import { createGetTimelineUseCase } from '../useCase/getTimeline.ts';
import { createGetUnreadNotificationCountUseCase } from '../useCase/getUnreadNotificationCount.ts';
import { PublishArticleUseCase } from '../useCase/publishArticle.ts';
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
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { WorkerRuntimePorts } from './ports.ts';
import {
  createWorkerGetRemoteActorPostsUseCase,
  createWorkerGetServerTimelineUseCase,
  createWorkerGetUserPostsUseCase,
  createWorkerRemoteActorActions,
} from './workerCoreUseCases.ts';

export const createWorkerRuntimePorts = async (
  env: IoriWorkerEnv,
): Promise<WorkerRuntimePorts> => {
  const federationRuntime = await createCloudflareFederationRuntime(env);
  const db = createD1Db(env.DB);
  const sessionResolver = createD1SessionResolver(db);
  const userResolver = createD1UserResolver(db);
  const actorResolverByUserId = createD1ActorResolverByUserId(db);
  const postResolver = createD1PostResolver(db);
  const postCreatedStore = createD1PostCreatedStore(db);
  const timelineItemCreatedStore = createD1TimelineItemCreatedStore(db);
  const articleResolver = createD1ArticleResolver(db);
  const likeResolver = createD1LikeResolver(db);
  const repostResolver = createD1RepostResolver(db);
  const emojiReactResolverByActorAndPostAndEmoji = createD1EmojiReactResolverByActorAndPostAndEmoji(db);
  const threadResolver = createD1ThreadResolver(db, env.ORIGIN);
  const uploads = createPostImageR2ObjectStore({ bucket: env.UPLOADS });
  const pushSubscriptionsResolver = createD1PushSubscriptionsResolverByUserId(db);
  const webPushSender = createCloudflareWebPushSender({
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  });
  const remotePostUpserter = createD1RemotePostUpserter({
    postResolverByUri: createD1PostResolverByUri(db),
    postCreatedStore,
    remoteActorCreatedStore: createD1RemoteActorCreatedStore(db),
    logoUriUpdatedStore: createD1LogoUriUpdatedStore(db),
    actorResolverByUri: createD1ActorResolverByUri(db),
  });
  const remoteActorActions = createWorkerRemoteActorActions({
    sessionResolver,
    userResolver,
    actorResolverByUserId,
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
      }),
    },
    timeline: {
      getTimelineUseCase: createGetTimelineUseCase({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
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
      getUnreadNotificationCountUseCase: createGetUnreadNotificationCountUseCase({
        sessionResolver,
        userResolver,
        unreadNotificationCountResolverByUserId: createD1UnreadNotificationCountResolverByUserId(db),
      }),
      getNotificationsUseCase: GetNotificationsUseCase.create({
        sessionResolver,
        userResolver,
        notificationsResolver: createD1NotificationsResolverByUserId(db),
        notificationsReadStore: createD1NotificationsReadStore(db),
      }),
      getLikedPostsUseCase: GetLikedPostsUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
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
      // OGP images are generated by the offline PNG backfill job; the Worker only reads R2 objects.
      publishOgImage: async () => undefined,
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
      getFederatedTimelineUseCase: GetFederatedTimelineUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        federatedTimelineItemsResolver: createD1FederatedTimelineItemsResolver(db, env.ORIGIN),
        mutedActorIdsResolverByUserId: createD1MutedActorIdsResolverByUserId(db),
      }),
      getUserPostsUseCase: createWorkerGetUserPostsUseCase({
        userResolverByUsername: createD1UserResolverByUsername(db),
        actorResolverByUserId,
        actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
        actorsResolverByFollowingId: createD1ActorsResolverByFollowingId(db),
        postsResolverByActorIds: createD1PostsResolverByActorIds(db, env.ORIGIN),
      }),
      getRemoteActorPostsUseCase: createWorkerGetRemoteActorPostsUseCase({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        actorResolverById: createD1ActorResolverById(db),
        followResolver: createD1FollowResolver(db),
        muteResolver: createD1MuteResolver(db),
        postsResolverByActorIdWithPagination: createD1PostsResolverByActorIdWithPagination(db, env.ORIGIN),
      }),
      getServerTimelineUseCase: createWorkerGetServerTimelineUseCase(createD1LocalPostsResolver(db, env.ORIGIN)),
      threadResolver,
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
  };
};
