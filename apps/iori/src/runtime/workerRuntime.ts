import { createD1AccountProfilesResolverByActorIds } from '../adaptor/d1/actor/accountProfilesResolverByActorIds.ts';
import { createD1AccountStatsResolverByActorId } from '../adaptor/d1/actor/accountStatsResolverByActorId.ts';
import { createD1ActorIdResolverByAcct } from '../adaptor/d1/actor/actorIdResolverByAcct.ts';
import { createD1ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import { createD1ActorResolverByUri } from '../adaptor/d1/actor/actorResolverByUri.ts';
import { createD1ActorResolverByUserId } from '../adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowerId } from '../adaptor/d1/actor/actorsResolverByFollowerId.ts';
import { createD1ActorsResolverByFollowingId } from '../adaptor/d1/actor/actorsResolverByFollowingId.ts';
import { createD1LocalActorCreatedStore } from '../adaptor/d1/actor/localActorCreatedStore.ts';
import { createD1LogoUriUpdatedStore } from '../adaptor/d1/actor/logoUriUpdatedStore.ts';
import { createD1RemoteActorCreatedStore } from '../adaptor/d1/actor/remoteActorCreatedStore.ts';
import { createD1RemoteActorProfileUpdatedStore } from '../adaptor/d1/actor/remoteActorProfileUpdatedStore.ts';
import { createD1AiSummaryUsageRecorder } from '../adaptor/d1/aiSummary/aiSummaryUsageRecorder.ts';
import { createD1AiTranslationUsageRecorder } from '../adaptor/d1/aiTranslation/aiTranslationUsageRecorder.ts';
import { createD1PostTranslationStore } from '../adaptor/d1/aiTranslation/postTranslationStore.ts';
import { createD1ArticleCreatedStore } from '../adaptor/d1/article/articleCreatedStore.ts';
import { createD1ArticleDeletedStore } from '../adaptor/d1/article/articleDeletedStore.ts';
import { createD1ArticlePublishedStore } from '../adaptor/d1/article/articlePublishedStore.ts';
import { createD1ArticleResolver } from '../adaptor/d1/article/articleResolver.ts';
import { createD1ArticleResolverByRootPostId } from '../adaptor/d1/article/articleResolverByRootPostId.ts';
import { createD1ArticlesResolverByAuthorActorId } from '../adaptor/d1/article/articlesResolverByAuthorActorId.ts';
import { createD1ArticleUnpublishedStore } from '../adaptor/d1/article/articleUnpublishedStore.ts';
import { createD1ArticleWithBodyCreatedStore } from '../adaptor/d1/article/articleWithBodyCreatedStore.ts';
import { createD1ArticleWithBodyEditedStore } from '../adaptor/d1/article/articleWithBodyEditedStore.ts';
import { createD1ArticleWithDependentsDeletedStore } from '../adaptor/d1/article/articleWithDependentsDeletedStore.ts';
import { createD1PublishedArticlesWithAuthorResolver } from '../adaptor/d1/article/publishedArticlesWithAuthorResolver.ts';
import { createD1ArticleBodyResolver } from '../adaptor/d1/articleBody/articleBodyResolver.ts';
import { createD1ArticleBodyWrittenStore } from '../adaptor/d1/articleBody/articleBodyWrittenStore.ts';
import { createD1BlockCreatedStore } from '../adaptor/d1/block/blockCreatedStore.ts';
import { createD1BlockDeletedStore } from '../adaptor/d1/block/blockDeletedStore.ts';
import { createD1BlockedActorsResolverByUserIdWithPagination } from '../adaptor/d1/block/blockedActorsResolverByUserIdWithPagination.ts';
import { createD1BlockedActorUriResolverByUsername } from '../adaptor/d1/block/blockedActorUriResolverByUsername.ts';
import { createD1BlockResolver } from '../adaptor/d1/block/blockResolver.ts';
import { createD1MutedOrBlockedActorIdsResolverByUserId } from '../adaptor/d1/block/mutedOrBlockedActorIdsResolverByUserId.ts';
import { createD1BlueskyCrosspostStatusReportResolver } from '../adaptor/d1/blueskyCrosspost/blueskyCrosspostStatusReportResolver.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1DigestHeaderResolverByArticleId } from '../adaptor/d1/digest/digestHeaderResolverByArticleId.ts';
import { createD1DigestHeadersResolverByArticleIds } from '../adaptor/d1/digest/digestHeadersResolverByArticleIds.ts';
import { createD1DigestItemFeedbackGivenStore } from '../adaptor/d1/digest/digestItemFeedbackGivenStore.ts';
import { createD1DigestResolverByArticleId } from '../adaptor/d1/digest/digestResolverByArticleId.ts';
import { createD1DigestResolverByDigestItemId } from '../adaptor/d1/digest/digestResolverByDigestItemId.ts';
import { createD1DigestResolverByUserId } from '../adaptor/d1/digest/digestResolverByUserId.ts';
import { createD1DigestResolverByUserIdAndDigestDate } from '../adaptor/d1/digest/digestResolverByUserIdAndDigestDate.ts';
import { createD1DigestTopicEntriesResolverByUserIdAndDigestDate } from '../adaptor/d1/digest/digestTopicEntriesResolverByUserIdAndDigestDate.ts';
import { createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom } from '../adaptor/d1/digest/digestTopicItemsResolverByUserIdAndDigestDateFrom.ts';
import { createD1DigestXPostsResolverByArticleId } from '../adaptor/d1/digest/digestXPostsResolverByArticleId.ts';
import { createD1DigestSubscriptionResolverByUserId } from '../adaptor/d1/digestSubscription/digestSubscriptionResolverByUserId.ts';
import { createD1DigestSubscriptionSavedStore } from '../adaptor/d1/digestSubscription/digestSubscriptionSavedStore.ts';
import { createD1DigestTopicCreatedStore } from '../adaptor/d1/digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEditedStore } from '../adaptor/d1/digestTopic/digestTopicEditedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../adaptor/d1/digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicEnabledChangedStore } from '../adaptor/d1/digestTopic/digestTopicEnabledChangedStore.ts';
import { createD1DigestTopicMaterialWindowChangedStore } from '../adaptor/d1/digestTopic/digestTopicMaterialWindowChangedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../adaptor/d1/digestTopic/digestTopicsResolverByUserId.ts';
import { createD1EmojiReactCreatedStore } from '../adaptor/d1/emojiReact/emojiReactCreatedStore.ts';
import { createD1EmojiReactDeletedStore } from '../adaptor/d1/emojiReact/emojiReactDeletedStore.ts';
import { createD1EmojiReactResolverByActorAndPostAndEmoji } from '../adaptor/d1/emojiReact/emojiReactResolverByActorAndPostAndEmoji.ts';
import { createD1FederatedTimelineItemsResolver } from '../adaptor/d1/federatedTimeline/federatedTimelineItemsResolver.ts';
import { createD1FeedEntryEmbeddingResolverByFeedEntryId } from '../adaptor/d1/feedEntry/feedEntryEmbeddingResolverByFeedEntryId.ts';
import { createD1HatenaTrendsResolverByFetchedSince } from '../adaptor/d1/feedEntry/hatenaTrendsResolverByFetchedSince.ts';
import { createD1XFeedEntriesResolver } from '../adaptor/d1/feedEntry/xFeedEntriesResolver.ts';
import { createD1AllFeedSourcesResolver } from '../adaptor/d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../adaptor/d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceEnabledChangedStore } from '../adaptor/d1/feedSource/feedSourceEnabledChangedStore.ts';
import { createD1AccountRelationshipsResolverByActorIds } from '../adaptor/d1/follow/accountRelationshipsResolverByActorIds.ts';
import {
  createD1ActorIdsResolverByFollowerIdWithPagination,
  createD1ActorIdsResolverByFollowingIdWithPagination,
} from '../adaptor/d1/follow/actorIdsResolverByFollowsWithPagination.ts';
import { createD1FollowRequestedStore } from '../adaptor/d1/follow/followRequestedStore.ts';
import { createD1FollowResolver } from '../adaptor/d1/follow/followResolver.ts';
import { createD1UndoFollowingProcessedStore } from '../adaptor/d1/follow/undoFollowingProcessedStore.ts';
import { createD1PostImageCreatedStore } from '../adaptor/d1/image/postImageCreatedStore.ts';
import { createD1InterestSourceDeletedStore } from '../adaptor/d1/interestSource/interestSourceDeletedStore.ts';
import { createD1InterestSourceEmbeddingCopiedStore } from '../adaptor/d1/interestSource/interestSourceEmbeddingCopiedStore.ts';
import { createD1InterestSourcesResolverByUserIdAndRefAndKinds } from '../adaptor/d1/interestSource/interestSourcesResolverByUserIdAndRefAndKinds.ts';
import { createD1LikedPostIdsResolverByActorIdWithPagination } from '../adaptor/d1/like/likedPostIdsResolverByActorIdWithPagination.ts';
import { createD1LikeResolver } from '../adaptor/d1/like/likeResolver.ts';
import { createD1LocalLikeCreatedStore } from '../adaptor/d1/like/localLikeCreatedStore.ts';
import { createD1LocalLikeDeletedStore } from '../adaptor/d1/like/localLikeDeletedStore.ts';
import { createD1LinkPreviewCreatedStore } from '../adaptor/d1/linkPreview/linkPreviewCreatedStore.ts';
import { createD1TimelineLinkTrendsResolverByUserId } from '../adaptor/d1/linkPreview/timelineLinkTrendsResolverByUserId.ts';
import { createD1MarkerSavedStore } from '../adaptor/d1/marker/markerSavedStore.ts';
import { createD1MarkersResolverByUserId } from '../adaptor/d1/marker/markersResolverByUserId.ts';
import { createD1MediaUploadCreatedStore } from '../adaptor/d1/mediaUpload/mediaUploadCreatedStore.ts';
import { createD1MediaUploadDescriptionUpdatedStore } from '../adaptor/d1/mediaUpload/mediaUploadDescriptionUpdatedStore.ts';
import { createD1MediaUploadResolver } from '../adaptor/d1/mediaUpload/mediaUploadResolver.ts';
import { createD1MuteCreatedStore } from '../adaptor/d1/mute/muteCreatedStore.ts';
import { createD1MutedActorsResolverByUserIdWithPagination } from '../adaptor/d1/mute/mutedActorsResolverByUserIdWithPagination.ts';
import { createD1MuteDeletedStore } from '../adaptor/d1/mute/muteDeletedStore.ts';
import { createD1MuteResolver } from '../adaptor/d1/mute/muteResolver.ts';
import {
  createD1NotificationDismissedStore,
  createD1NotificationsClearedStore,
  createD1ReplyNotificationCreatedStore,
} from '../adaptor/d1/notification/inboxNotificationAdapters.ts';
import { createD1NotificationCountResolverSinceMarker } from '../adaptor/d1/notification/notificationCountResolverSinceMarker.ts';
import { createD1NotificationIdsResolverByUserIdAndCreatedAt } from '../adaptor/d1/notification/notificationIdsResolverByUserIdAndCreatedAt.ts';
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
import { createD1LocalPostUrisResolverByUris } from '../adaptor/d1/post/localPostUrisResolverByUris.ts';
import { createD1PostCreatedStore } from '../adaptor/d1/post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../adaptor/d1/post/postDeletedStore.ts';
import { createD1PostExtrasResolverByPosts } from '../adaptor/d1/post/postExtrasResolverByPosts.ts';
import { createD1PostResolver } from '../adaptor/d1/post/postResolver.ts';
import { createD1PostResolverByUri } from '../adaptor/d1/post/postResolverByUri.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../adaptor/d1/post/postWithAuthorBatch.ts';
import { createD1RemotePostUpserter } from '../adaptor/d1/post/remotePostUpserter.ts';
import { createD1RemotePostUrisResolverByUris } from '../adaptor/d1/post/remotePostUrisResolverByUris.ts';
import { createD1ThreadResolver } from '../adaptor/d1/post/threadResolver.ts';
import { createD1PushSubscriptionCreatedStore } from '../adaptor/d1/pushSubscription/pushSubscriptionCreatedStore.ts';
import { createD1PushSubscriptionResolverByEndpoint } from '../adaptor/d1/pushSubscription/pushSubscriptionResolverByEndpoint.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1RecommendableArticlesResolverByFetchedSince } from '../adaptor/d1/recommendation/recommendableArticlesResolverByFetchedSince.ts';
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
import { createD1HomePostsResolverByPeriod } from '../adaptor/d1/timeline/homePostsResolverByPeriod.ts';
import { createD1TimelineItemCreatedStore } from '../adaptor/d1/timeline/timelineItemCreatedStore.ts';
import { createD1TimelineItemDeletedStore } from '../adaptor/d1/timeline/timelineItemDeletedStore.ts';
import { createD1TimelineItemResolverByRepostId } from '../adaptor/d1/timeline/timelineItemResolverByRepostId.ts';
import { createD1TimelineItemsResolverByActorIds } from '../adaptor/d1/timeline/timelineItemsResolverByActorIds.ts';
import { createD1TimelineSearchCandidatesResolver } from '../adaptor/d1/timelineSearch/timelineSearchCandidatesResolver.ts';
import { createD1UserCreatedStore } from '../adaptor/d1/user/userCreatedStore.ts';
import { createD1UserResolver } from '../adaptor/d1/user/userResolver.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createD1UserPasswordResolver } from '../adaptor/d1/userPassword/userPasswordResolver.ts';
import { createD1UserPasswordSetStore } from '../adaptor/d1/userPassword/userPasswordSetStore.ts';
import { createCloudflareRemoteActorLookup } from '../adaptor/fedify/cloudflareRemoteActorLookup.ts';
import { createStatusAssembler } from '../adaptor/mastodon/statusAssembler.ts';
import { createOgpFetcher } from '../adaptor/ogp/ogpFetcher.ts';
import { createR2OgImageStore } from '../adaptor/r2/ogImageStore.ts';
import { createPostImageR2ObjectStore } from '../adaptor/r2/postImageObjectStore.ts';
import { htmlToMarkdown } from '../adaptor/text/htmlToMarkdown.ts';
import { htmlToPlainText } from '../adaptor/text/htmlToPlainText.ts';
import { createCloudflareWebPushSender } from '../adaptor/webPush/cloudflareWebPushSender.ts';
import { createWorkersAiEmbedder } from '../adaptor/workersAi/workersAiEmbedder.ts';
import type { WorkersAiRunner } from '../adaptor/workersAi/workersAiRunner.ts';
import { createWorkersAiTextGenerator } from '../adaptor/workersAi/workersAiTextGenerator.ts';
import { createWorkersAiTopicRelevanceJudge } from '../adaptor/workersAi/workersAiTopicRelevanceJudge.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import { renderMarkdownToUnsanitizedHtml } from '../domain/post/postContent.ts';
import { createCloudflareFederationRuntime, type WaitUntil } from '../federation.cloudflare.ts';
import { createDigestUseCases } from '../scheduled/digestTasks.ts';
import { createRefreshXPostsUseCase } from '../scheduled/feedTasks.ts';
import { AddDigestTopicUseCase } from '../useCase/addDigestTopic.ts';
import { AddFeedSourceUseCase } from '../useCase/addFeedSource.ts';
import { ChangeDigestTopicEnabledUseCase } from '../useCase/changeDigestTopicEnabled.ts';
import { ChangeDigestTopicMaterialWindowUseCase } from '../useCase/changeDigestTopicMaterialWindow.ts';
import { ChangeFeedSourceEnabledUseCase } from '../useCase/changeFeedSourceEnabled.ts';
import { ClearNotificationsUseCase } from '../useCase/clearNotifications.ts';
import { CreateArticleUseCase } from '../useCase/createArticle.ts';
import { CreateArticleWithBodyUseCase } from '../useCase/createArticleWithBody.ts';
import { CreateBlockUseCase } from '../useCase/createBlock.ts';
import { CreateMuteUseCase } from '../useCase/createMute.ts';
import { createCreatePostUseCase } from '../useCase/createPost.ts';
import { DeleteArticleUseCase } from '../useCase/deleteArticle.ts';
import { DeleteBlockUseCase } from '../useCase/deleteBlock.ts';
import { DeleteMuteUseCase } from '../useCase/deleteMute.ts';
import { DeletePostUseCase } from '../useCase/deletePost.ts';
import { DismissNotificationUseCase } from '../useCase/dismissNotification.ts';
import { EditArticleUseCase } from '../useCase/editArticle.ts';
import { EditDigestTopicUseCase } from '../useCase/editDigestTopic.ts';
import { ExchangeTokenUseCase } from '../useCase/exchangeToken.ts';
import { FetchRemoteContextUseCase } from '../useCase/fetchRemoteContext.ts';
import { FetchRemoteOutboxUseCase } from '../useCase/fetchRemoteOutbox.ts';
import { FetchReplyNotesRecursiveUseCase } from '../useCase/fetchReplyNotesRecursive.ts';
import { GetArticleForEditUseCase } from '../useCase/getArticleForEdit.ts';
import { GetArticlesUseCase } from '../useCase/getArticles.ts';
import { GetArticleWithThreadUseCase } from '../useCase/getArticleWithThread.ts';
import { GetMediaUploadUseCase } from '../useCase/getMediaUpload.ts';
import { createGetTimelineUseCase } from '../useCase/getTimeline.ts';
import { GetXFeedEntriesUseCase } from '../useCase/getXFeedEntries.ts';
import { GiveDigestItemFeedbackUseCase } from '../useCase/giveDigestItemFeedback.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { IssueAuthorizationCodeUseCase } from '../useCase/issueAuthorizationCode.ts';
import { PreviewDigestTopicsUseCase } from '../useCase/previewDigestTopics.ts';
import { PublishArticleUseCase } from '../useCase/publishArticle.ts';
import { RegisterOAuthApplicationUseCase } from '../useCase/registerOAuthApplication.ts';
import { ResolveRemoteAccountUseCase } from '../useCase/resolveRemoteAccount.ts';
import { RevokeTokenUseCase } from '../useCase/revokeToken.ts';
import { SaveDigestSubscriptionUseCase } from '../useCase/saveDigestSubscription.ts';
import { SaveMarkersUseCase } from '../useCase/saveMarkers.ts';
import { createSearchTimelineUseCase } from '../useCase/searchTimeline.ts';
import { SendEmojiReactUseCase } from '../useCase/sendEmojiReact.ts';
import { SendLikeUseCase } from '../useCase/sendLike.ts';
import { SendReplyUseCase } from '../useCase/sendReply.ts';
import { SendRepostUseCase } from '../useCase/sendRepost.ts';
import { createSignInUseCase } from '../useCase/signIn.ts';
import { createSignUpUseCase } from '../useCase/signUp.ts';
import { SubscribePushUseCase } from '../useCase/subscribePush.ts';
import { SubscribeRelayUseCase } from '../useCase/subscribeRelay.ts';
import { createSummarizeTimelineUseCase } from '../useCase/summarizeTimeline.ts';
import { createTranslatePostUseCase } from '../useCase/translatePost.ts';
import { UndoEmojiReactUseCase } from '../useCase/undoEmojiReact.ts';
import { UndoLikeUseCase } from '../useCase/undoLike.ts';
import { UndoRepostUseCase } from '../useCase/undoRepost.ts';
import { UnpublishArticleUseCase } from '../useCase/unpublishArticle.ts';
import { UpdateArticleBodyUseCase } from '../useCase/updateArticleBody.ts';
import { UpdateAvatarUseCase } from '../useCase/updateAvatar.ts';
import { UpdateMediaDescriptionUseCase } from '../useCase/updateMediaDescription.ts';
import { UploadMediaUseCase } from '../useCase/uploadMedia.ts';
import { ValidateAuthorizationRequestUseCase } from '../useCase/validateAuthorizationRequest.ts';
import { VerifyAccessTokenUseCase } from '../useCase/verifyAccessToken.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createBlueskyCrosspostUseCases, resolveBlueskyCrosspostConfig } from './blueskyCrosspost.ts';
import { createBlueskyProfileRuntimePorts } from './blueskyProfile.ts';
import { createBlueskyTimelineRuntimePorts } from './blueskyTimeline.ts';
import type { WorkerRuntimePorts } from './ports.ts';
import { createWorkerBlockActions, createWorkerRemoteActorActions } from './workerCoreUseCases.ts';

const lazyWorkerArgon2idDerive: Argon2idDerive = async (params) => {
  const { workerArgon2idDerive } = await import('../adaptor/argon2/workerArgon2idDerive.ts');
  return workerArgon2idDerive(params);
};

export const createWorkerRuntimePorts = async (
  env: IoriWorkerEnv,
  waitUntil: WaitUntil,
): Promise<WorkerRuntimePorts> => {
  const federationRuntime = await createCloudflareFederationRuntime(env, waitUntil);
  const blueskyCrosspost = createBlueskyCrosspostUseCases(env, waitUntil);
  const db = createD1Db(env.DB);
  const workersAi = env.AI as unknown as WorkersAiRunner | undefined;
  const textGenerator = workersAi === undefined ? undefined : createWorkersAiTextGenerator(workersAi);
  const sessionResolver = createD1SessionResolver(db);
  const sessionWithUserAndActorResolver = createD1SessionWithUserAndActorResolver(db);
  const userResolver = createD1UserResolver(db);
  const actorResolverByUserId = createD1ActorResolverByUserId(db);
  const markersResolverByUserId = createD1MarkersResolverByUserId(db);
  const mutedActorIdsResolverByUserId = createD1MutedOrBlockedActorIdsResolverByUserId(db);
  const searchTimeline = createSearchTimelineUseCase({
    actorResolverByUserId,
    actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
    mutedActorIdsResolverByUserId,
    textGenerator,
    timelineSearchCandidatesResolver: createD1TimelineSearchCandidatesResolver(db),
    htmlToPlainText,
  });
  const digestResolverByUserIdAndDigestDate = createD1DigestResolverByUserIdAndDigestDate(db);
  const digestSubscriptionResolverByUserId = createD1DigestSubscriptionResolverByUserId(db);
  const allFeedSourcesResolver = createD1AllFeedSourcesResolver(db);
  const digestTopicsResolverByUserId = createD1DigestTopicsResolverByUserId(db);
  const digestTopicEmbeddedStore = createD1DigestTopicEmbeddedStore(db);
  const topicTextEmbedder = workersAi === undefined ? undefined : createWorkersAiEmbedder(workersAi);
  const postResolver = createD1PostResolver(db);
  const postCreatedStore = createD1PostCreatedStore(db);
  const timelineItemCreatedStore = createD1TimelineItemCreatedStore(db);
  const articleResolver = createD1ArticleResolver(db);
  const articleBodyResolver = createD1ArticleBodyResolver(db);
  const isDigestOwner = IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) });
  const articleBodyWrittenStore = createD1ArticleBodyWrittenStore(db);
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
    remoteActorProfileUpdatedStore: createD1RemoteActorProfileUpdatedStore(db),
    actorResolverByUri: createD1ActorResolverByUri(db),
  });
  const postResolverByUri = createD1PostResolverByUri(db);
  const localPostResolverByUri = createD1LocalPostResolverByUri(db, env.ORIGIN);
  const mediaUploadResolver = createD1MediaUploadResolver(db);
  const oauthApplicationResolverByClientId = createD1OAuthApplicationResolverByClientId(db);
  const accessTokenResolverByTokenHash = createD1AccessTokenResolverByTokenHash(db);
  const accessTokenRevokedStore = createD1AccessTokenRevokedStore(db);
  const authorizationCodeResolverByCodeHash = createD1AuthorizationCodeResolverByCodeHash(db);
  const remoteActorActions = createWorkerRemoteActorActions({
    userResolver,
    actorResolverByUserId,
    actorResolverById: createD1ActorResolverById(db),
    followResolver: createD1FollowResolver(db),
    followRequestedStore: createD1FollowRequestedStore(db),
    undoFollowingProcessedStore: createD1UndoFollowingProcessedStore(db),
  });
  const blockActions = createWorkerBlockActions({
    userResolver,
    actorResolverByUserId,
    actorResolverById: createD1ActorResolverById(db),
    followResolver: createD1FollowResolver(db),
    undoFollowingProcessedStore: createD1UndoFollowingProcessedStore(db),
    blockResolver: createD1BlockResolver(db),
    createBlockUseCase: CreateBlockUseCase.create({
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      blockCreatedStore: createD1BlockCreatedStore(db),
      blockResolver: createD1BlockResolver(db),
    }),
    deleteBlockUseCase: DeleteBlockUseCase.create({
      sessionResolver,
      userResolver,
      blockDeletedStore: createD1BlockDeletedStore(db),
      blockResolver: createD1BlockResolver(db),
    }),
    unfollowRemoteActor: remoteActorActions.unfollowRemoteActor,
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
      mutedActorIdsResolverByUserId,
      timelineItemsResolverByActorIds: createD1TimelineItemsResolverByActorIds(db),
      localPostsResolverByPage: createD1LocalPostsResolverByPage(db),
      accountStatusItemsResolverByActorId: createD1AccountStatusItemsResolverByActorId(db),
      federatedTimelineItemsResolver: createD1FederatedTimelineItemsResolver(db),
      postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
      repostResolverById: createD1RepostResolverById(db),
      repostResolver,
      threadResolver,
      actorIdsResolverByFollowerId: createD1ActorIdsResolverByFollowerIdWithPagination(db),
      actorIdsResolverByFollowingId: createD1ActorIdsResolverByFollowingIdWithPagination(db),
      actorIdResolverByAcct: createD1ActorIdResolverByAcct(db),
      accountRelationshipsResolverByActorIds: createD1AccountRelationshipsResolverByActorIds(db),
      likedPostIdsResolverByActorIdWithPagination: createD1LikedPostIdsResolverByActorIdWithPagination(db),
      mutedActorsResolverByUserIdWithPagination: createD1MutedActorsResolverByUserIdWithPagination(db),
      blockedActorsResolverByUserIdWithPagination: createD1BlockedActorsResolverByUserIdWithPagination(db),
      statusAssembler: createStatusAssembler({
        accountProfilesResolver: createD1AccountProfilesResolverByActorIds(db),
        postExtrasResolver: createD1PostExtrasResolverByPosts(db, env.ORIGIN),
      }),
      searchTimeline,
      summarizeTimeline: createSummarizeTimelineUseCase({
        actorResolverByUserId,
        actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
        mutedActorIdsResolverByUserId,
        searchTimeline,
        homePostsResolverByPeriod: createD1HomePostsResolverByPeriod(db),
        postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
        aiSummaryUsageRecorder: createD1AiSummaryUsageRecorder(db),
        textGenerator,
        htmlToPlainText,
      }),
      translatePost: createTranslatePostUseCase({
        postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
        postTranslationStore: createD1PostTranslationStore(db),
        aiTranslationUsageRecorder: createD1AiTranslationUsageRecorder(db),
        textGenerator,
        htmlToPlainText,
      }),
      notificationsResolverByPage: createD1NotificationsResolverByPage(db),
      notificationResolverByUserIdAndId: createD1NotificationResolverByUserIdAndId(db),
      notificationCountResolverSinceMarker: createD1NotificationCountResolverSinceMarker(db),
      dismissNotificationUseCase: DismissNotificationUseCase.create({
        notificationResolverByUserIdAndId: createD1NotificationResolverByUserIdAndId(db),
        notificationDismissedStore: createD1NotificationDismissedStore(db),
      }),
      clearNotificationsUseCase: ClearNotificationsUseCase.create({
        notificationsResolverByPage: createD1NotificationsResolverByPage(db),
        notificationsClearedStore: createD1NotificationsClearedStore(db),
      }),
      resolveRemoteAccountUseCase: ResolveRemoteAccountUseCase.create({
        userResolver,
        remoteActorLookup: createCloudflareRemoteActorLookup(federationRuntime.federation),
        remoteActorCreatedStore: createD1RemoteActorCreatedStore(db),
        logoUriUpdatedStore: createD1LogoUriUpdatedStore(db),
        remoteActorProfileUpdatedStore: createD1RemoteActorProfileUpdatedStore(db),
        actorResolverByUri: createD1ActorResolverByUri(db),
      }),
      markersResolverByUserId,
      notificationIdsResolverByUserIdAndCreatedAt: createD1NotificationIdsResolverByUserIdAndCreatedAt(db),
      saveMarkersUseCase: SaveMarkersUseCase.create({
        markersResolverByUserId,
        markerSavedStore: createD1MarkerSavedStore(db),
      }),
      uploadMediaUseCase: UploadMediaUseCase.create({
        userResolver,
        uploads,
        mediaUploadCreatedStore: createD1MediaUploadCreatedStore(db),
        origin: env.ORIGIN,
      }),
      mediaUploadResolver,
      getMediaUploadUseCase: GetMediaUploadUseCase.create({ mediaUploadResolver }),
      updateMediaDescriptionUseCase: UpdateMediaDescriptionUseCase.create({
        mediaUploadResolver,
        mediaUploadDescriptionUpdatedStore: createD1MediaUploadDescriptionUpdatedStore(db),
      }),
      updateAvatarUseCase: UpdateAvatarUseCase.create({
        actorResolverByUserId,
        uploads,
        logoUriUpdatedStore: createD1LogoUriUpdatedStore(db),
        origin: env.ORIGIN,
      }),
    },
    blueskyTimeline: createBlueskyTimelineRuntimePorts(env, db),
    blueskyProfile: createBlueskyProfileRuntimePorts(env, db),
    digest: {
      digestResolverByUserIdAndDigestDate,
      digestResolverByUserId: createD1DigestResolverByUserId(db),
      digestTopicEntriesResolverByUserIdAndDigestDate: createD1DigestTopicEntriesResolverByUserIdAndDigestDate(db),
      timelineLinkTrendsResolverByUserId: createD1TimelineLinkTrendsResolverByUserId(db),
      hatenaTrendsResolverByFetchedSince: createD1HatenaTrendsResolverByFetchedSince(db),
      digestSubscriptionResolverByUserId,
      saveDigestSubscriptionUseCase: SaveDigestSubscriptionUseCase.create({
        digestSubscriptionResolverByUserId,
        digestSubscriptionSavedStore: createD1DigestSubscriptionSavedStore(db),
      }),
      requestDigestUseCase: createDigestUseCases(env).requestDigest,
      deepDiveDigestItemUseCase: createDigestUseCases(env).deepDiveDigestItem,
      giveDigestItemFeedbackUseCase: GiveDigestItemFeedbackUseCase.create({
        articleResolver,
        digestResolverByDigestItemId: createD1DigestResolverByDigestItemId(db),
        feedEntryEmbeddingResolverByFeedEntryId: createD1FeedEntryEmbeddingResolverByFeedEntryId(db),
        interestSourcesResolverByUserIdAndRefAndKinds: createD1InterestSourcesResolverByUserIdAndRefAndKinds(db),
        interestSourceDeletedStore: createD1InterestSourceDeletedStore(db),
        interestSourceEmbeddingCopiedStore: createD1InterestSourceEmbeddingCopiedStore(db),
        digestItemFeedbackGivenStore: createD1DigestItemFeedbackGivenStore(db),
        now: Instant.now,
      }),
      allFeedSourcesResolver,
      addFeedSourceUseCase: AddFeedSourceUseCase.create({
        allFeedSourcesResolver,
        feedSourceCreatedStore: createD1FeedSourceCreatedStore(db),
        now: Instant.now,
      }),
      changeFeedSourceEnabledUseCase: ChangeFeedSourceEnabledUseCase.create({
        allFeedSourcesResolver,
        feedSourceEnabledChangedStore: createD1FeedSourceEnabledChangedStore(db),
        now: Instant.now,
      }),
      isDigestOwner,
      getXFeedEntriesUseCase: GetXFeedEntriesUseCase.create({
        xFeedEntriesResolver: createD1XFeedEntriesResolver(db),
        now: Instant.now,
      }),
      refreshXPostsUseCase: createRefreshXPostsUseCase(env),
      digestTopicsResolverByUserId,
      addDigestTopicUseCase: AddDigestTopicUseCase.create({
        digestTopicsResolverByUserId,
        digestTopicCreatedStore: createD1DigestTopicCreatedStore(db),
        digestTopicEmbeddedStore,
        textEmbedder: topicTextEmbedder,
        now: Instant.now,
      }),
      editDigestTopicUseCase: EditDigestTopicUseCase.create({
        digestTopicsResolverByUserId,
        digestTopicEditedStore: createD1DigestTopicEditedStore(db),
        digestTopicEmbeddedStore,
        textEmbedder: topicTextEmbedder,
        now: Instant.now,
      }),
      changeDigestTopicEnabledUseCase: ChangeDigestTopicEnabledUseCase.create({
        digestTopicsResolverByUserId,
        digestTopicEnabledChangedStore: createD1DigestTopicEnabledChangedStore(db),
        now: Instant.now,
      }),
      changeDigestTopicMaterialWindowUseCase: ChangeDigestTopicMaterialWindowUseCase.create({
        digestTopicsResolverByUserId,
        digestTopicMaterialWindowChangedStore: createD1DigestTopicMaterialWindowChangedStore(db),
        now: Instant.now,
      }),
      previewDigestTopicsUseCase: PreviewDigestTopicsUseCase.create({
        digestTopicsResolverByUserId,
        recommendableArticlesResolverByFetchedSince: createD1RecommendableArticlesResolverByFetchedSince(db),
        digestTopicItemsResolverByUserIdAndDigestDateFrom: createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom(
          db,
        ),
        topicRelevanceJudge: workersAi === undefined ? undefined : createWorkersAiTopicRelevanceJudge(workersAi),
        now: Instant.now,
      }),
    },
    blueskyCrosspostStatus: {
      userResolverByUsername: createD1UserResolverByUsername(db),
      blueskyCrosspostStatusReportResolver: createD1BlueskyCrosspostStatusReportResolver(db),
      blueskyCrosspostEnabled: resolveBlueskyCrosspostConfig(env) !== undefined,
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
        mutedActorIdsResolverByUserId,
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
        scheduleBlueskyCrosspost: blueskyCrosspost?.schedule,
        origin: env.ORIGIN,
      }),
      remoteActorLookup: createCloudflareRemoteActorLookup(federationRuntime.federation),
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
        actorResolverById: createD1ActorResolverById(db),
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
        articleResolverByRootPostId: createD1ArticleResolverByRootPostId(db),
      }),
      undoRepostUseCase: UndoRepostUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        actorResolverById: createD1ActorResolverById(db),
        repostResolver,
        repostDeletedStore: createD1RepostDeletedStore(db),
        timelineItemResolverByRepostId: createD1TimelineItemResolverByRepostId(db),
        timelineItemDeletedStore: createD1TimelineItemDeletedStore(db),
        postResolver,
        articleResolverByRootPostId: createD1ArticleResolverByRootPostId(db),
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
      fetchRemoteContextUseCase: FetchRemoteContextUseCase.create({
        origin: env.ORIGIN,
        userResolver,
        postResolver,
        remotePostUrisResolverByUris: createD1RemotePostUrisResolverByUris(db),
        localPostUrisResolverByUris: createD1LocalPostUrisResolverByUris(db, env.ORIGIN),
        remotePostUpserter,
        blockedActorUriResolverByUsername: createD1BlockedActorUriResolverByUsername(db),
        fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase.create({
          origin: env.ORIGIN,
          postResolverByUri,
          localPostResolverByUri,
          remotePostUpserter,
        }),
      }),
      fetchRemoteOutboxUseCase: FetchRemoteOutboxUseCase.create({
        origin: env.ORIGIN,
        userResolver,
        actorResolverById: createD1ActorResolverById(db),
        remotePostUrisResolverByUris: createD1RemotePostUrisResolverByUris(db),
        localPostUrisResolverByUris: createD1LocalPostUrisResolverByUris(db, env.ORIGIN),
        remotePostUpserter,
        blockedActorUriResolverByUsername: createD1BlockedActorUriResolverByUsername(db),
      }),
    },
    articles: {
      getArticleWithThreadUseCase: GetArticleWithThreadUseCase.create({
        articleResolver,
        threadResolver: createD1ThreadResolver(db, env.ORIGIN),
        articleBodyResolver,
        digestXPostsResolverByArticleId: createD1DigestXPostsResolverByArticleId(db),
        isDigestOwner,
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
      createArticleWithBodyUseCase: CreateArticleWithBodyUseCase.create({
        actorResolverByUserId,
        articleWithBodyCreatedStore: createD1ArticleWithBodyCreatedStore(db),
      }),
      updateArticleBodyUseCase: UpdateArticleBodyUseCase.create({
        articleResolver,
        articleBodyWrittenStore,
      }),
      getArticleForEditUseCase: GetArticleForEditUseCase.create({
        articleResolver,
        articleBodyResolver,
        htmlToMarkdown,
      }),
      editArticleUseCase: EditArticleUseCase.create({
        articleResolver,
        articleWithBodyEditedStore: createD1ArticleWithBodyEditedStore(db),
        renderMarkdown: renderMarkdownToUnsanitizedHtml,
      }),
      articleBodyResolver,
      publishArticleUseCase: PublishArticleUseCase.create({
        sessionResolver,
        userResolver,
        actorResolverByUserId,
        articleResolver,
        articlePublishedStore: createD1ArticlePublishedStore(db),
        articleBodyResolver,
        digestResolverByArticleId: createD1DigestResolverByArticleId(db),
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
        articleBodyResolver,
        digestHeaderResolverByArticleId: createD1DigestHeaderResolverByArticleId(db),
        articleWithDependentsDeletedStore: createD1ArticleWithDependentsDeletedStore(db),
      }),
      publishedArticlesResolver: createD1PublishedArticlesWithAuthorResolver(db),
      digestHeadersResolverByArticleIds: createD1DigestHeadersResolverByArticleIds(db),
      digestResolverByArticleId: createD1DigestResolverByArticleId(db),
      actorResolverByUserId,
      // OGP images are generated on first request by serveOgImage and cached in R2.
      publishOgImage: async () => undefined,
      deleteOgImage: (articleId) => ogImageStore.delete(articleId),
    },
    mutesRelays: {
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
        scheduleBlueskyCrosspost: blueskyCrosspost?.schedule,
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
        removeBlueskyCrosspost: blueskyCrosspost?.remove,
      }),
      subscribePushUseCase: SubscribePushUseCase.create({
        sessionResolver,
        userResolver,
        pushSubscriptionCreatedStore: createD1PushSubscriptionCreatedStore(db),
        pushSubscriptionResolverByEndpoint: createD1PushSubscriptionResolverByEndpoint(db),
      }),
      ...remoteActorActions,
      ...blockActions,
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
    },
    uploads,
    federation: federationRuntime.federation,
    textGenerator,
    textEmbedder: workersAi === undefined ? undefined : createWorkersAiEmbedder(workersAi),
  };
};
