import type { ExecutionContext } from '@cloudflare/workers-types';
import { Note } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { afterEach, vi } from 'vitest';

import { createIoriApp } from '../../../../appFactory.tsx';
import { Instant } from '../../../../domain/instant/instant.ts';
import { MediaId } from '../../../../domain/mediaUpload/mediaId.ts';
import { MediaUpload } from '../../../../domain/mediaUpload/mediaUpload.ts';
import { UserId } from '../../../../domain/user/userId.ts';
import type { BlueskyChat } from '../../../../ports/blueskyChat.ts';
import type { BlueskyClient, BlueskyQueryClient } from '../../../../ports/blueskyClient.ts';
import type { BlueskyPostSubject } from '../../../../ports/blueskyPostCidResolver.ts';
import type { BlueskyPostThreadFetcher } from '../../../../ports/blueskyPostThreadFetcher.ts';
import type { BlueskySearch } from '../../../../ports/blueskySearch.ts';
import type { PostImageObjectStore } from '../../../../ports/postImageObjectStore.ts';
import type { TextEmbedder } from '../../../../ports/textEmbedder.ts';
import type { TextGenerator } from '../../../../ports/textGenerator.ts';
import type { TopicRelevanceJudge } from '../../../../ports/topicRelevanceJudge.ts';
import { createWorkerBlockActions, createWorkerRemoteActorActions } from '../../../../runtime/workerCoreUseCases.ts';
import { createWorkerReportAction } from '../../../../runtime/workerReportActions.ts';
import { createDigestUseCases } from '../../../../scheduled/digestTasks.ts';
import { AddDigestTopicUseCase } from '../../../../useCase/addDigestTopic.ts';
import { AddFeedSourceUseCase } from '../../../../useCase/addFeedSource.ts';
import { BlueskyChatUseCases } from '../../../../useCase/blueskyChat.ts';
import { ChangeDigestTopicEnabledUseCase } from '../../../../useCase/changeDigestTopicEnabled.ts';
import { ChangeDigestTopicMaterialWindowUseCase } from '../../../../useCase/changeDigestTopicMaterialWindow.ts';
import { ChangeFeedSourceEnabledUseCase } from '../../../../useCase/changeFeedSourceEnabled.ts';
import { ClearNotificationsUseCase } from '../../../../useCase/clearNotifications.ts';
import { CreateBlockUseCase } from '../../../../useCase/createBlock.ts';
import { CreateMuteUseCase } from '../../../../useCase/createMute.ts';
import { CreatePostUseCase } from '../../../../useCase/createPost.ts';
import { DeleteBlockUseCase } from '../../../../useCase/deleteBlock.ts';
import { DeleteMuteUseCase } from '../../../../useCase/deleteMute.ts';
import { DeletePostUseCase } from '../../../../useCase/deletePost.ts';
import { DismissNotificationUseCase } from '../../../../useCase/dismissNotification.ts';
import { EditDigestTopicUseCase } from '../../../../useCase/editDigestTopic.ts';
import { FetchRemoteContextUseCase } from '../../../../useCase/fetchRemoteContext.ts';
import { FetchRemoteOutboxUseCase } from '../../../../useCase/fetchRemoteOutbox.ts';
import { FetchReplyNotesRecursiveUseCase } from '../../../../useCase/fetchReplyNotesRecursive.ts';
import { GetXFeedEntriesUseCase } from '../../../../useCase/getXFeedEntries.ts';
import { GiveDigestItemFeedbackUseCase } from '../../../../useCase/giveDigestItemFeedback.ts';
import { IsDigestOwner } from '../../../../useCase/isDigestOwner.ts';
import { LikeBlueskyPostUseCase } from '../../../../useCase/likeBlueskyPost.ts';
import { MarkBlueskyNotificationsSeenUseCase } from '../../../../useCase/markBlueskyNotificationsSeen.ts';
import { PostToBlueskyUseCase } from '../../../../useCase/postToBluesky.ts';
import { PreviewDigestTopicsUseCase } from '../../../../useCase/previewDigestTopics.ts';
import { QuoteBlueskyPostUseCase } from '../../../../useCase/quoteBlueskyPost.ts';
import type { RefreshXPostsUseCase } from '../../../../useCase/refreshXPosts.ts';
import { ReplyToBlueskyPostUseCase } from '../../../../useCase/replyToBlueskyPost.ts';
import { RepostBlueskyPostUseCase } from '../../../../useCase/repostBlueskyPost.ts';
import { ResolveRemoteAccountUseCase } from '../../../../useCase/resolveRemoteAccount.ts';
import { ResolveRemotePostUseCase } from '../../../../useCase/resolveRemotePost.ts';
import { SaveDigestSubscriptionUseCase } from '../../../../useCase/saveDigestSubscription.ts';
import { SaveMarkersUseCase } from '../../../../useCase/saveMarkers.ts';
import type { ScheduleBlueskyCrosspostUseCase } from '../../../../useCase/scheduleBlueskyCrosspost.ts';
import { createSearchTimelineUseCase } from '../../../../useCase/searchTimeline.ts';
import { SendEmojiReactUseCase } from '../../../../useCase/sendEmojiReact.ts';
import { SendLikeUseCase } from '../../../../useCase/sendLike.ts';
import { SendReplyUseCase } from '../../../../useCase/sendReply.ts';
import { SendRepostUseCase } from '../../../../useCase/sendRepost.ts';
import { SubscribePushUseCase } from '../../../../useCase/subscribePush.ts';
import { SubscribeRelayUseCase } from '../../../../useCase/subscribeRelay.ts';
import { createSummarizeTimelineUseCase } from '../../../../useCase/summarizeTimeline.ts';
import { createTranslatePostUseCase } from '../../../../useCase/translatePost.ts';
import { UndoEmojiReactUseCase } from '../../../../useCase/undoEmojiReact.ts';
import { UndoLikeUseCase } from '../../../../useCase/undoLike.ts';
import { UndoRepostUseCase } from '../../../../useCase/undoRepost.ts';
import { UndoRepostBlueskyPostUseCase } from '../../../../useCase/undoRepostBlueskyPost.ts';
import { UnlikeBlueskyPostUseCase } from '../../../../useCase/unlikeBlueskyPost.ts';
import type { IoriWorkerEnv } from '../../../../workerEnv.ts';
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
import { createD1RemoteActorProfileUpdatedStore } from '../../../d1/actor/remoteActorProfileUpdatedStore.ts';
import { createD1AiSummaryUsageRecorder } from '../../../d1/aiSummary/aiSummaryUsageRecorder.ts';
import { createD1AiTranslationUsageRecorder } from '../../../d1/aiTranslation/aiTranslationUsageRecorder.ts';
import { createD1PostTranslationStore } from '../../../d1/aiTranslation/postTranslationStore.ts';
import { createD1ArticleDeletedStore } from '../../../d1/article/articleDeletedStore.ts';
import { createD1ArticleResolver } from '../../../d1/article/articleResolver.ts';
import { createD1ArticleResolverByRootPostId } from '../../../d1/article/articleResolverByRootPostId.ts';
import { createD1BlockCreatedStore } from '../../../d1/block/blockCreatedStore.ts';
import { createD1BlockDeletedStore } from '../../../d1/block/blockDeletedStore.ts';
import { createD1BlockedActorsResolverByUserIdWithPagination } from '../../../d1/block/blockedActorsResolverByUserIdWithPagination.ts';
import { createD1BlockedActorUriResolverByUsername } from '../../../d1/block/blockedActorUriResolverByUsername.ts';
import { createD1BlockResolver } from '../../../d1/block/blockResolver.ts';
import { createD1MutedOrBlockedActorIdsResolverByUserId } from '../../../d1/block/mutedOrBlockedActorIdsResolverByUserId.ts';
import { createD1BlueskyLoginFailureResolver } from '../../../d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import { createD1BlueskySyncStatusResolver } from '../../../d1/blueskySyncStatus/blueskySyncStatusStore.ts';
import { createD1BlueskyLikeDeletedStore } from '../../../d1/blueskyTimeline/blueskyLikeDeletedStore.ts';
import { createD1BlueskyLikeSavedStore } from '../../../d1/blueskyTimeline/blueskyLikeSavedStore.ts';
import { createD1BlueskyLikeTargetResolver } from '../../../d1/blueskyTimeline/blueskyLikeTargetResolver.ts';
import { createD1BlueskyLikeUriResolver } from '../../../d1/blueskyTimeline/blueskyLikeUriResolver.ts';
import { createD1BlueskyRepostDeletedStore } from '../../../d1/blueskyTimeline/blueskyRepostDeletedStore.ts';
import { createD1BlueskyRepostSavedStore } from '../../../d1/blueskyTimeline/blueskyRepostSavedStore.ts';
import { createD1BlueskyRepostTargetResolver } from '../../../d1/blueskyTimeline/blueskyRepostTargetResolver.ts';
import { createD1BlueskyRepostUriResolver } from '../../../d1/blueskyTimeline/blueskyRepostUriResolver.ts';
import { createD1BlueskyTimelineItemsResolver } from '../../../d1/blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createD1DigestItemFeedbackGivenStore } from '../../../d1/digest/digestItemFeedbackGivenStore.ts';
import { createD1DigestResolverByDigestItemId } from '../../../d1/digest/digestResolverByDigestItemId.ts';
import { createD1DigestResolverByUserId } from '../../../d1/digest/digestResolverByUserId.ts';
import { createD1DigestResolverByUserIdAndDigestDate } from '../../../d1/digest/digestResolverByUserIdAndDigestDate.ts';
import { createD1DigestTopicEntriesResolverByUserIdAndDigestDate } from '../../../d1/digest/digestTopicEntriesResolverByUserIdAndDigestDate.ts';
import { createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom } from '../../../d1/digest/digestTopicItemsResolverByUserIdAndDigestDateFrom.ts';
import { createD1DigestSubscriptionResolverByUserId } from '../../../d1/digestSubscription/digestSubscriptionResolverByUserId.ts';
import { createD1DigestSubscriptionSavedStore } from '../../../d1/digestSubscription/digestSubscriptionSavedStore.ts';
import { createD1DigestTopicCreatedStore } from '../../../d1/digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEditedStore } from '../../../d1/digestTopic/digestTopicEditedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../../../d1/digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicEnabledChangedStore } from '../../../d1/digestTopic/digestTopicEnabledChangedStore.ts';
import { createD1DigestTopicMaterialWindowChangedStore } from '../../../d1/digestTopic/digestTopicMaterialWindowChangedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../../../d1/digestTopic/digestTopicsResolverByUserId.ts';
import { createD1EmojiReactCreatedStore } from '../../../d1/emojiReact/emojiReactCreatedStore.ts';
import { createD1EmojiReactDeletedStore } from '../../../d1/emojiReact/emojiReactDeletedStore.ts';
import { createD1EmojiReactResolverByActorAndPostAndEmoji } from '../../../d1/emojiReact/emojiReactResolverByActorAndPostAndEmoji.ts';
import { createD1FederatedTimelineItemsResolver } from '../../../d1/federatedTimeline/federatedTimelineItemsResolver.ts';
import { createD1FeedEntryEmbeddingResolverByFeedEntryId } from '../../../d1/feedEntry/feedEntryEmbeddingResolverByFeedEntryId.ts';
import { createD1HatenaTrendsResolverByFetchedSince } from '../../../d1/feedEntry/hatenaTrendsResolverByFetchedSince.ts';
import { createD1XFeedEntriesResolver } from '../../../d1/feedEntry/xFeedEntriesResolver.ts';
import { createD1AllFeedSourcesResolver } from '../../../d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../../../d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceEnabledChangedStore } from '../../../d1/feedSource/feedSourceEnabledChangedStore.ts';
import { createD1AccountRelationshipsResolverByActorIds } from '../../../d1/follow/accountRelationshipsResolverByActorIds.ts';
import {
  createD1ActorIdsResolverByFollowerIdWithPagination,
  createD1ActorIdsResolverByFollowingIdWithPagination,
} from '../../../d1/follow/actorIdsResolverByFollowsWithPagination.ts';
import { createD1FollowRequestedStore } from '../../../d1/follow/followRequestedStore.ts';
import { createD1FollowResolver } from '../../../d1/follow/followResolver.ts';
import { createD1UndoFollowingProcessedStore } from '../../../d1/follow/undoFollowingProcessedStore.ts';
import { createD1PostImageCreatedStore } from '../../../d1/image/postImageCreatedStore.ts';
import { createD1InterestSourceDeletedStore } from '../../../d1/interestSource/interestSourceDeletedStore.ts';
import { createD1InterestSourceEmbeddingCopiedStore } from '../../../d1/interestSource/interestSourceEmbeddingCopiedStore.ts';
import { createD1InterestSourcesResolverByUserIdAndRefAndKinds } from '../../../d1/interestSource/interestSourcesResolverByUserIdAndRefAndKinds.ts';
import { createD1LikedPostIdsResolverByActorIdWithPagination } from '../../../d1/like/likedPostIdsResolverByActorIdWithPagination.ts';
import { createD1LikeResolver } from '../../../d1/like/likeResolver.ts';
import { createD1LocalLikeCreatedStore } from '../../../d1/like/localLikeCreatedStore.ts';
import { createD1LocalLikeDeletedStore } from '../../../d1/like/localLikeDeletedStore.ts';
import { createD1LinkPreviewCreatedStore } from '../../../d1/linkPreview/linkPreviewCreatedStore.ts';
import { createD1TimelineLinkTrendsResolverByUserId } from '../../../d1/linkPreview/timelineLinkTrendsResolverByUserId.ts';
import { createD1MarkerSavedStore } from '../../../d1/marker/markerSavedStore.ts';
import { createD1MarkersResolverByUserId } from '../../../d1/marker/markersResolverByUserId.ts';
import { createD1MediaUploadCreatedStore } from '../../../d1/mediaUpload/mediaUploadCreatedStore.ts';
import { createD1MediaUploadResolver } from '../../../d1/mediaUpload/mediaUploadResolver.ts';
import { createD1MuteCreatedStore } from '../../../d1/mute/muteCreatedStore.ts';
import { createD1MutedActorsResolverByUserIdWithPagination } from '../../../d1/mute/mutedActorsResolverByUserIdWithPagination.ts';
import { createD1MuteDeletedStore } from '../../../d1/mute/muteDeletedStore.ts';
import { createD1MuteResolver } from '../../../d1/mute/muteResolver.ts';
import {
  createD1NotificationDismissedStore,
  createD1NotificationsClearedStore,
  createD1ReplyNotificationCreatedStore,
} from '../../../d1/notification/inboxNotificationAdapters.ts';
import { createD1NotificationCountResolverSinceMarker } from '../../../d1/notification/notificationCountResolverSinceMarker.ts';
import { createD1NotificationIdsResolverByUserIdAndCreatedAt } from '../../../d1/notification/notificationIdsResolverByUserIdAndCreatedAt.ts';
import { createD1NotificationResolverByUserIdAndId } from '../../../d1/notification/notificationResolverByUserIdAndId.ts';
import { createD1NotificationsResolverByPage } from '../../../d1/notification/notificationsResolverByPage.ts';
import { createD1AccountStatusItemsResolverByActorId } from '../../../d1/post/accountStatusItemsResolverByActorId.ts';
import { createD1DirectPostParticipantsResolverByPostId } from '../../../d1/post/directPostParticipantsResolverByPostId.ts';
import { createD1LocalPostResolverByUri } from '../../../d1/post/localPostResolverByUri.ts';
import { createD1LocalPostsResolverByPage } from '../../../d1/post/localPostsResolverByPage.ts';
import { createD1LocalPostUrisResolverByUris } from '../../../d1/post/localPostUrisResolverByUris.ts';
import { createD1PostCreatedStore } from '../../../d1/post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../../../d1/post/postDeletedStore.ts';
import { createD1PostExtrasResolverByPosts } from '../../../d1/post/postExtrasResolverByPosts.ts';
import { createD1PostQuotesResolverByPostIds } from '../../../d1/post/postQuotesResolverByPostIds.ts';
import { createD1PostResolver } from '../../../d1/post/postResolver.ts';
import { createD1PostResolverByUri } from '../../../d1/post/postResolverByUri.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../../../d1/post/postWithAuthorBatch.ts';
import { createD1RemotePostUpserter } from '../../../d1/post/remotePostUpserter.ts';
import { createD1RemotePostUrisResolverByUris } from '../../../d1/post/remotePostUrisResolverByUris.ts';
import { createD1ThreadResolver } from '../../../d1/post/threadResolver.ts';
import { createD1PushSubscriptionCreatedStore } from '../../../d1/pushSubscription/pushSubscriptionCreatedStore.ts';
import { createD1PushSubscriptionResolverByEndpoint } from '../../../d1/pushSubscription/pushSubscriptionResolverByEndpoint.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../../../d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1RecommendableArticlesResolverByFetchedSince } from '../../../d1/recommendation/recommendableArticlesResolverByFetchedSince.ts';
import { createD1AcceptedRelaysResolver } from '../../../d1/relay/acceptedRelaysResolver.ts';
import { createD1AllRelaysResolver } from '../../../d1/relay/allRelaysResolver.ts';
import { createD1RelayResolverByActorUri } from '../../../d1/relay/relayResolverByActorUri.ts';
import { createD1RelaySubscriptionRequestedStore } from '../../../d1/relay/relaySubscriptionRequestedStore.ts';
import { createD1ReportSubmittedStore } from '../../../d1/report/reportSubmittedStore.ts';
import { createD1RepostCreatedStore } from '../../../d1/repost/repostCreatedStore.ts';
import { createD1RepostDeletedStore } from '../../../d1/repost/repostDeletedStore.ts';
import { createD1RepostResolver } from '../../../d1/repost/repostResolver.ts';
import { createD1RepostResolverById } from '../../../d1/repost/repostResolverById.ts';
import { createD1HomePostsResolverByPeriod } from '../../../d1/timeline/homePostsResolverByPeriod.ts';
import { createD1TimelineItemCreatedStore } from '../../../d1/timeline/timelineItemCreatedStore.ts';
import { createD1TimelineItemDeletedStore } from '../../../d1/timeline/timelineItemDeletedStore.ts';
import { createD1TimelineItemResolverByRepostId } from '../../../d1/timeline/timelineItemResolverByRepostId.ts';
import { createD1TimelineItemsResolverByActorIds } from '../../../d1/timeline/timelineItemsResolverByActorIds.ts';
import { createD1TimelineSearchCandidatesResolver } from '../../../d1/timelineSearch/timelineSearchCandidatesResolver.ts';
import { createD1UserResolver } from '../../../d1/user/userResolver.ts';
import { createD1UserResolverByUsername } from '../../../d1/user/userResolverByUsername.ts';
import { createStatusAssembler } from '../../../mastodon/statusAssembler.ts';
import { htmlToPlainText } from '../../../text/htmlToPlainText.ts';
import { createMastodonAuthn } from '../../mastodonAuthn.ts';
import { createWorkerIoriActionsRouter } from '../../workerIoriActionsRouter.ts';
import { createWorkerIoriBlueskyRouter } from '../../workerIoriBlueskyRouter.ts';
import { createWorkerIoriDigestRouter } from '../../workerIoriDigestRouter.ts';
import { createWorkerIoriSearchRouter } from '../../workerIoriSearchRouter.ts';
import { createWorkerIoriSummaryRouter } from '../../workerIoriSummaryRouter.ts';
import { createWorkerIoriXPostsRouter } from '../../workerIoriXPostsRouter.ts';
import { createWorkerMastodonAccountsRouter } from '../../workerMastodonAccountsRouter.ts';
import { createWorkerMastodonFallbackRouter } from '../../workerMastodonFallbackRouter.ts';
import { createWorkerMastodonMarkersRouter } from '../../workerMastodonMarkersRouter.ts';
import { createWorkerMastodonNotificationsRouter } from '../../workerMastodonNotificationsRouter.ts';
import { createWorkerMastodonReportsRouter } from '../../workerMastodonReportsRouter.ts';
import { createWorkerMastodonStatusesRouter } from '../../workerMastodonStatusesRouter.ts';
import { createWorkerMastodonTimelinesRouter } from '../../workerMastodonTimelinesRouter.ts';
import { createWorkerMastodonTranslateRouter } from '../../workerMastodonTranslateRouter.ts';
import { createWorkerMastodonViewerListsRouter } from '../../workerMastodonViewerListsRouter.ts';
import { createOAuthHarness, ORIGIN } from './oauthHarness.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const resolveBlueskyPostSubject = (
  entry: string | Readonly<{ cid: string; likeUri?: string; repostUri?: string }> | undefined,
): BlueskyPostSubject | undefined => {
  if (entry === undefined) return undefined;
  if (typeof entry === 'string') return { cid: entry, likeUri: null, repostUri: null };
  return { cid: entry.cid, likeUri: entry.likeUri ?? null, repostUri: entry.repostUri ?? null };
};

export const setupReadApi = (
  options: Readonly<{
    textGenerator?: TextGenerator;
    textEmbedder?: TextEmbedder;
    topicRelevanceJudge?: TopicRelevanceJudge;
    translationTimeoutMs?: number;
    searchTimeline?: Partial<Parameters<typeof createSearchTimelineUseCase>[0]>;
    blueskyTimelineEnabled?: boolean;
    blueskyNow?: () => Instant;
    blueskyLikeClient?: Pick<BlueskyClient, 'createLike' | 'deleteLike'>;
    blueskyRepostClient?: Pick<BlueskyClient, 'createRepost' | 'deleteRepost'>;
    blueskyPostThreadFetcher?: BlueskyPostThreadFetcher;
    blueskyReplyClient?: Pick<BlueskyClient, 'createRecord' | 'uploadBlob'> & BlueskyQueryClient;
    blueskyPostClient?: Pick<BlueskyClient, 'createRecord' | 'uploadBlob'> & BlueskyQueryClient;
    uploads?: Pick<PostImageObjectStore, 'get'>;
    blueskyQuoteClient?: Pick<BlueskyClient, 'createRecord' | 'uploadBlob'> & BlueskyQueryClient;
    blueskyPostCids?: Readonly<
      Record<string, string | Readonly<{ cid: string; likeUri?: string; repostUri?: string }>>
    >;
    blueskySeenClient?: Pick<BlueskyClient, 'updateSeen'>;
    blueskySearch?: BlueskySearch;
    blueskyChat?: BlueskyChat;
    refreshXPosts?: RefreshXPostsUseCase;
    scheduleBlueskyCrosspost?: ScheduleBlueskyCrosspostUseCase;
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
  const allFeedSourcesResolver = createD1AllFeedSourcesResolver(db);
  const digestTopicsResolverByUserId = createD1DigestTopicsResolverByUserId(db);
  const digestTopicEmbeddedStore = createD1DigestTopicEmbeddedStore(db);
  const sessionResolver = harness.memory.sessionResolver as never;
  const userResolver = createD1UserResolver(db);
  const postResolver = createD1PostResolver(db);
  const repostResolver = createD1RepostResolver(db);
  const timelineItemCreatedStore = createD1TimelineItemCreatedStore(db);
  const notificationResolverByUserIdAndId = createD1NotificationResolverByUserIdAndId(db);
  const notificationsResolverByPage = createD1NotificationsResolverByPage(db);
  const remoteActorCreatedStore = createD1RemoteActorCreatedStore(db);
  const logoUriUpdatedStore = createD1LogoUriUpdatedStore(db);
  const remoteActorProfileUpdatedStore = createD1RemoteActorProfileUpdatedStore(db);
  const actorResolverByUri = createD1ActorResolverByUri(db);
  const federation = {
    sendActivity: vi.fn(async () => undefined),
    getActorUri: (username: string) => new URL(`${ORIGIN}/users/${username}`),
    getFollowersUri: (username: string) => new URL(`${ORIGIN}/users/${username}/followers`),
    getObjectUri: (_type: unknown, values: { identifier: string; id: string }) =>
      new URL(`${ORIGIN}/users/${values.identifier}/posts/${values.id}`),
    getObject: vi.fn(async (_type: unknown, values: { identifier: string; id: string }) =>
      new Note({
        id: new URL(`${ORIGIN}/users/${values.identifier}/posts/${values.id}`),
        attribution: new URL(`${ORIGIN}/users/${values.identifier}`),
        to: new URL('https://www.w3.org/ns/activitystreams#Public'),
      })
    ),
    getDocumentLoader: vi.fn(async (): Promise<unknown> => ({})),
    getActorKeyPairs: vi.fn(async () => []),
    lookupObject: vi.fn(async (_uri?: string, _options?: unknown): Promise<unknown> => null),
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
  const reportRemoteActor = createWorkerReportAction({
    userResolver,
    actorResolverByUserId,
    actorResolverById: createD1ActorResolverById(db),
    postResolver,
    reportSubmittedStore: createD1ReportSubmittedStore(db),
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
  const mediaUploadResolver = createD1MediaUploadResolver(db);
  const postCreatedStore = createD1PostCreatedStore(db);
  const postImageCreatedStore = createD1PostImageCreatedStore(db);
  const remotePostUpserter = createD1RemotePostUpserter({
    postResolverByUri: createD1PostResolverByUri(db),
    postCreatedStore,
    postImageCreatedStore,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    remoteActorProfileUpdatedStore,
    actorResolverByUri,
  });
  const digestSubscriptionResolverByUserId = createD1DigestSubscriptionResolverByUserId(db);
  const statusAssembler = createStatusAssembler({
    accountProfilesResolver: createD1AccountProfilesResolverByActorIds(db),
    postExtrasResolver: createD1PostExtrasResolverByPosts(db, ORIGIN),
  });
  const searchTimeline = createSearchTimelineUseCase({
    actorResolverByUserId,
    actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
    mutedActorIdsResolverByUserId: createD1MutedOrBlockedActorIdsResolverByUserId(db),
    textGenerator: options.textGenerator,
    timelineSearchCandidatesResolver: createD1TimelineSearchCandidatesResolver(db),
    htmlToPlainText,
    ...options.searchTimeline,
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
          mutedActorIdsResolverByUserId: createD1MutedOrBlockedActorIdsResolverByUserId(db),
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
          userResolver,
          remoteActorLookup,
          actorResolverByUserId,
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          repostResolverById: createD1RepostResolverById(db),
          repostResolver,
          threadResolver: createD1ThreadResolver(db, ORIGIN),
          mutedActorIdsResolverByUserId: createD1MutedOrBlockedActorIdsResolverByUserId(db),
          statusAssembler,
          mediaUploadResolver,
          createPostUseCase: CreatePostUseCase.create({
            sessionResolver,
            postCreatedStore,
            userResolver,
            actorResolverByUserId,
            postImageCreatedStore,
            timelineItemCreatedStore,
            linkPreviewCreatedStore: createD1LinkPreviewCreatedStore(db),
            ogpFetcher: {
              fetch: async () => ({ title: null, description: null, imageUrl: null, faviconUrl: null, siteName: null }),
            },
            acceptedRelaysResolver: createD1AcceptedRelaysResolver(db),
            postQuotesResolver: createD1PostQuotesResolverByPostIds(db),
            origin: ORIGIN,
            scheduleBlueskyCrosspost: options.scheduleBlueskyCrosspost,
          }),
          sendReplyUseCase: SendReplyUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            postCreatedStore,
            postImageCreatedStore,
            timelineItemCreatedStore,
            localPostResolverByUri: createD1LocalPostResolverByUri(db, ORIGIN),
            replyNotificationCreatedStore: createD1ReplyNotificationCreatedStore(db),
            pushSubscriptionsResolver: createD1PushSubscriptionsResolverByUserId(db),
            webPushSender: { send: () => RA.ok(undefined) },
            postResolver,
            actorResolverById: createD1ActorResolverById(db),
            postQuotesResolver: createD1PostQuotesResolverByPostIds(db),
            origin: ORIGIN,
            scheduleBlueskyCrosspost: options.scheduleBlueskyCrosspost,
          }),
          deletePostUseCase: DeletePostUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            postResolver,
            postQuotesResolver: createD1PostQuotesResolverByPostIds(db),
            postDeletedStore: createD1PostDeletedStore(db),
            articleResolverByRootPostId: createD1ArticleResolverByRootPostId(db),
            articleDeletedStore: createD1ArticleDeletedStore(db),
            directPostParticipantsResolverByPostId: createD1DirectPostParticipantsResolverByPostId(db),
          }),
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
            actorResolverById: createD1ActorResolverById(db),
            likeResolver: createD1LikeResolver(db),
            localLikeDeletedStore: createD1LocalLikeDeletedStore(db),
            postResolver,
          }),
          sendRepostUseCase: SendRepostUseCase.create({
            origin: ORIGIN,
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
              remoteActorProfileUpdatedStore,
              actorResolverByUri,
            }),
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
          blockActor: blockActions.blockActor,
          unblockActor: blockActions.unblockActor,
          createContext,
        }),
      );
      root.route(
        '/api',
        createWorkerMastodonReportsRouter({
          authn,
          statusAssembler,
          reportRemoteActor,
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
          blockedActorsResolverByUserIdWithPagination: createD1BlockedActorsResolverByUserIdWithPagination(db),
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          statusAssembler,
        }),
      );
      root.route(
        '/api',
        createWorkerIoriSearchRouter({
          authn,
          actorResolverByUserId,
          searchTimeline,
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          statusAssembler,
          resolveRemoteAccountUseCase: ResolveRemoteAccountUseCase.create({
            userResolver,
            remoteActorLookup,
            remoteActorCreatedStore,
            logoUriUpdatedStore,
            remoteActorProfileUpdatedStore,
            actorResolverByUri,
          }),
          resolveRemotePostUseCase: ResolveRemotePostUseCase.create({
            origin: ORIGIN,
            userResolver,
            postResolverByUri: createD1PostResolverByUri(db),
            localPostResolverByUri: createD1LocalPostResolverByUri(db, ORIGIN),
            actorResolverById: createD1ActorResolverById(db),
            remotePostUpserter,
            blockedActorUriResolverByUsername: createD1BlockedActorUriResolverByUsername(db),
            isBlockedUri: () => false,
            lookupUrlResolver: async (url) => ({ type: 'resolved', url }),
          }),
          createContext,
        }),
      );
      root.route(
        '/api',
        createWorkerIoriSummaryRouter({
          authn,
          summarizeTimeline: createSummarizeTimelineUseCase({
            actorResolverByUserId,
            actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
            mutedActorIdsResolverByUserId: createD1MutedOrBlockedActorIdsResolverByUserId(db),
            searchTimeline,
            homePostsResolverByPeriod: createD1HomePostsResolverByPeriod(db),
            postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
            aiSummaryUsageRecorder: createD1AiSummaryUsageRecorder(db),
            textGenerator: options.textGenerator,
            htmlToPlainText,
          }),
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          statusAssembler,
        }),
      );
      root.route(
        '/api',
        createWorkerMastodonTranslateRouter({
          authn,
          actorResolverByUserId,
          translatePost: createTranslatePostUseCase({
            postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
            postTranslationStore: createD1PostTranslationStore(db),
            aiTranslationUsageRecorder: createD1AiTranslationUsageRecorder(db),
            textGenerator: options.textGenerator,
            translationTimeoutMs: options.translationTimeoutMs,
            htmlToPlainText,
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
          notificationIdsResolverByUserIdAndCreatedAt: createD1NotificationIdsResolverByUserIdAndCreatedAt(db),
          saveMarkersUseCase: SaveMarkersUseCase.create({
            markersResolverByUserId,
            markerSavedStore: createD1MarkerSavedStore(db),
          }),
        }),
      );
      root.route(
        '/api',
        createWorkerIoriBlueskyRouter({
          authn,
          blueskyTimelineItemsResolver: createD1BlueskyTimelineItemsResolver(db),
          blueskyTimelineEnabled: options.blueskyTimelineEnabled ?? false,
          blueskySyncStatusResolver: createD1BlueskySyncStatusResolver(db),
          blueskyLoginFailureResolver: createD1BlueskyLoginFailureResolver(db, 'timeline'),
          now: options.blueskyNow,
          likeBlueskyPostUseCase: options.blueskyLikeClient === undefined ? undefined : LikeBlueskyPostUseCase.create({
            client: options.blueskyLikeClient,
            targetResolver: createD1BlueskyLikeTargetResolver(db),
            likeUriResolver: createD1BlueskyLikeUriResolver(db),
            cidResolver: { resolve: async (uri) => RA.ok(resolveBlueskyPostSubject(options.blueskyPostCids?.[uri])) },
            savedStore: createD1BlueskyLikeSavedStore(db),
            now: Instant.now,
          }),
          unlikeBlueskyPostUseCase: options.blueskyLikeClient === undefined
            ? undefined
            : UnlikeBlueskyPostUseCase.create({
              client: options.blueskyLikeClient,
              targetResolver: createD1BlueskyLikeTargetResolver(db),
              likeUriResolver: createD1BlueskyLikeUriResolver(db),
              cidResolver: { resolve: async (uri) => RA.ok(resolveBlueskyPostSubject(options.blueskyPostCids?.[uri])) },
              deletedStore: createD1BlueskyLikeDeletedStore(db),
            }),
          repostBlueskyPostUseCase: options.blueskyRepostClient === undefined
            ? undefined
            : RepostBlueskyPostUseCase.create({
              client: options.blueskyRepostClient,
              targetResolver: createD1BlueskyRepostTargetResolver(db),
              repostUriResolver: createD1BlueskyRepostUriResolver(db),
              cidResolver: { resolve: async (uri) => RA.ok(resolveBlueskyPostSubject(options.blueskyPostCids?.[uri])) },
              viewerRepostResolver: { resolve: async () => RA.ok(null) },
              savedStore: createD1BlueskyRepostSavedStore(db),
              now: Instant.now,
            }),
          undoRepostBlueskyPostUseCase: options.blueskyRepostClient === undefined
            ? undefined
            : UndoRepostBlueskyPostUseCase.create({
              client: options.blueskyRepostClient,
              targetResolver: createD1BlueskyRepostTargetResolver(db),
              repostUriResolver: createD1BlueskyRepostUriResolver(db),
              cidResolver: { resolve: async (uri) => RA.ok(resolveBlueskyPostSubject(options.blueskyPostCids?.[uri])) },
              deletedStore: createD1BlueskyRepostDeletedStore(db),
            }),
          blueskyPostThreadFetcher: options.blueskyPostThreadFetcher,
          replyToBlueskyPostUseCase: options.blueskyReplyClient === undefined
            ? undefined
            : ReplyToBlueskyPostUseCase.create({
              client: options.blueskyReplyClient,
              query: options.blueskyReplyClient.query,
              targetResolver: createD1BlueskyLikeTargetResolver(db),
              now: Instant.now,
            }),
          postToBlueskyUseCase: options.blueskyPostClient === undefined
            ? undefined
            : PostToBlueskyUseCase.create({
              client: options.blueskyPostClient,
              query: options.blueskyPostClient.query,
              now: Instant.now,
            }),
          mediaUploadResolver,
          uploads: options.uploads ?? { get: async () => undefined },
          quoteBlueskyPostUseCase: options.blueskyQuoteClient === undefined
            ? undefined
            : QuoteBlueskyPostUseCase.create({
              client: options.blueskyQuoteClient,
              query: options.blueskyQuoteClient.query,
              now: Instant.now,
            }),
          markBlueskyNotificationsSeenUseCase: options.blueskySeenClient === undefined
            ? undefined
            : MarkBlueskyNotificationsSeenUseCase.create({
              client: options.blueskySeenClient,
              now: options.blueskyNow ?? Instant.now,
            }),
          blueskySearch: options.blueskySearch,
          blueskyChat: options.blueskyChat === undefined
            ? undefined
            : BlueskyChatUseCases.create({ chat: options.blueskyChat, query: async () => RA.ok({}) }),
          isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
        }),
      );
      root.route(
        '/api',
        createWorkerIoriDigestRouter({
          authn,
          digestResolverByUserIdAndDigestDate: createD1DigestResolverByUserIdAndDigestDate(db),
          digestResolverByUserId: createD1DigestResolverByUserId(db),
          digestTopicEntriesResolverByUserIdAndDigestDate: createD1DigestTopicEntriesResolverByUserIdAndDigestDate(db),
          timelineLinkTrendsResolverByUserId: createD1TimelineLinkTrendsResolverByUserId(db),
          hatenaTrendsResolverByFetchedSince: createD1HatenaTrendsResolverByFetchedSince(db),
          digestSubscriptionResolverByUserId,
          saveDigestSubscriptionUseCase: SaveDigestSubscriptionUseCase.create({
            digestSubscriptionResolverByUserId,
            digestSubscriptionSavedStore: createD1DigestSubscriptionSavedStore(db),
          }),
          requestDigestUseCase: createDigestUseCases({ DB: fixture.binding } as unknown as IoriWorkerEnv)
            .requestDigest,
          deepDiveDigestItemUseCase: createDigestUseCases({ DB: fixture.binding } as unknown as IoriWorkerEnv)
            .deepDiveDigestItem,
          giveDigestItemFeedbackUseCase: GiveDigestItemFeedbackUseCase.create({
            articleResolver: createD1ArticleResolver(db),
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
          isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
          digestTopicsResolverByUserId,
          addDigestTopicUseCase: AddDigestTopicUseCase.create({
            digestTopicsResolverByUserId,
            digestTopicCreatedStore: createD1DigestTopicCreatedStore(db),
            digestTopicEmbeddedStore,
            textEmbedder: options.textEmbedder,
            now: Instant.now,
          }),
          editDigestTopicUseCase: EditDigestTopicUseCase.create({
            digestTopicsResolverByUserId,
            digestTopicEditedStore: createD1DigestTopicEditedStore(db),
            digestTopicEmbeddedStore,
            textEmbedder: options.textEmbedder,
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
            digestTopicItemsResolverByUserIdAndDigestDateFrom:
              createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom(db),
            topicRelevanceJudge: options.topicRelevanceJudge,
            now: Instant.now,
          }),
        }),
      );
      root.route(
        '/api',
        createWorkerIoriXPostsRouter({
          authn,
          getXFeedEntriesUseCase: GetXFeedEntriesUseCase.create({
            xFeedEntriesResolver: createD1XFeedEntriesResolver(db),
            now: Instant.now,
          }),
          refreshXPostsUseCase: options.refreshXPosts,
          isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
        }),
      );
      root.route(
        '/api',
        createWorkerIoriActionsRouter({
          authn,
          actorResolverByUserId,
          postsWithAuthorResolverByPostIds: createD1PostsWithAuthorResolverByPostIds(db),
          statusAssembler,
          sendEmojiReactUseCase: SendEmojiReactUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            emojiReactCreatedStore: createD1EmojiReactCreatedStore(db),
            emojiReactResolverByActorAndPostAndEmoji: createD1EmojiReactResolverByActorAndPostAndEmoji(db),
            postResolver,
          }),
          undoEmojiReactUseCase: UndoEmojiReactUseCase.create({
            sessionResolver,
            userResolver,
            actorResolverByUserId,
            emojiReactDeletedStore: createD1EmojiReactDeletedStore(db),
            emojiReactResolverByActorAndPostAndEmoji: createD1EmojiReactResolverByActorAndPostAndEmoji(db),
            postResolver,
          }),
          subscribeRelayUseCase: SubscribeRelayUseCase.create({
            relayResolverByActorUri: createD1RelayResolverByActorUri(db),
            relaySubscriptionRequestedStore: createD1RelaySubscriptionRequestedStore(db),
          }),
          subscribePushUseCase: SubscribePushUseCase.create({
            sessionResolver,
            userResolver,
            pushSubscriptionCreatedStore: createD1PushSubscriptionCreatedStore(db),
            pushSubscriptionResolverByEndpoint: createD1PushSubscriptionResolverByEndpoint(db),
          }),
          fetchRemoteContextUseCase: FetchRemoteContextUseCase.create({
            origin: ORIGIN,
            userResolver,
            postResolver,
            remotePostUrisResolverByUris: createD1RemotePostUrisResolverByUris(db),
            localPostUrisResolverByUris: createD1LocalPostUrisResolverByUris(db, ORIGIN),
            remotePostUpserter,
            blockedActorUriResolverByUsername: createD1BlockedActorUriResolverByUsername(db),
            fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase.create({
              origin: ORIGIN,
              postResolverByUri: createD1PostResolverByUri(db),
              localPostResolverByUri: createD1LocalPostResolverByUri(db, ORIGIN),
              remotePostUpserter,
              isBlockedUri: () => false,
            }),
            isBlockedUri: () => false,
          }),
          fetchRemoteOutboxUseCase: FetchRemoteOutboxUseCase.create({
            origin: ORIGIN,
            userResolver,
            actorResolverById: createD1ActorResolverById(db),
            remotePostUrisResolverByUris: createD1RemotePostUrisResolverByUris(db),
            localPostUrisResolverByUris: createD1LocalPostUrisResolverByUris(db, ORIGIN),
            remotePostUpserter,
            blockedActorUriResolverByUsername: createD1BlockedActorUriResolverByUsername(db),
            isBlockedUri: () => false,
          }),
          allRelaysResolver: createD1AllRelaysResolver(db),
          createContext,
        }),
      );
      root.route('/api', createWorkerMastodonFallbackRouter());
    },
    serveAsset: async () => undefined,
    serveUpload: async () => undefined,
    serveOgImage: async () => new Response('og', { status: 200 }),
  });
  const request = (path: string, init?: RequestInit, executionCtx?: ExecutionContext) =>
    app.request(`${ORIGIN}${path}`, init, undefined, executionCtx);

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

  const addMedia = async (userId: string, description: string | null = null) => {
    const mediaId = MediaId.generate();
    const created = MediaUpload.create({
      mediaId,
      userId: UserId.orThrow(userId),
      url: `${ORIGIN}/uploads/${mediaId}`,
      mimeType: 'image/png',
      description,
    }, Instant.now());
    if (!created.ok) throw new Error(created.err.message);
    await createD1MediaUploadCreatedStore(db).store(created.val);
    return { mediaId, url: `${ORIGIN}/uploads/${mediaId}`, description };
  };

  const bearerFor = async (scope: string) => ({
    Authorization: `Bearer ${(await harness.issueUserToken(scope)).token}`,
  });

  return {
    ...harness,
    seed,
    db,
    request,
    signIn,
    addMedia,
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
