import type { Context, Federation } from '@fedify/fedify';
import type { ResultAsync } from '@iwasa-kosui/result';

import type { ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import type { StatusAssembler } from '../adaptor/mastodon/statusAssembler.ts';
import type { createPostImageR2ObjectStore } from '../adaptor/r2/postImageObjectStore.ts';
import type {
  ActorIdsResolverByFollowerIdWithPagination,
  ActorIdsResolverByFollowingIdWithPagination,
} from '../domain/actor/accountProfile.ts';
import type {
  AccountRelationshipsResolverByActorIds,
  ActorIdResolverByAcct,
} from '../domain/actor/accountRelationship.ts';
import type { AccountStatsResolverByActorId } from '../domain/actor/accountStats.ts';
import type { ActorResolverByUserId, ActorsResolverByFollowerId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Article, PublishedArticlesWithAuthorResolver } from '../domain/article/article.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../domain/articleBody/articleBody.ts';
import type {
  DigestHeadersResolverByArticleIds,
  DigestResolverByArticleId,
  DigestResolverByUserId,
  DigestResolverByUserIdAndDigestDate,
  DigestTopicEntriesResolverByUserIdAndDigestDate,
} from '../domain/digest/digest.ts';
import type {
  HatenaTrendsResolverByFetchedSince,
  TimelineLinkTrendsResolverByUserId,
} from '../domain/digest/digestMaterial.ts';
import type { DigestSubscriptionResolverByUserId } from '../domain/digestSubscription/digestSubscription.ts';
import type { DigestTopicsResolverByUserId } from '../domain/digestTopic/digestTopic.ts';
import type { FederatedTimelineItemsResolver } from '../domain/federatedTimeline/federatedTimelineItem.ts';
import type { AllFeedSourcesResolver } from '../domain/feedSource/feedSource.ts';
import type { LikedPostIdsResolverByActorIdWithPagination } from '../domain/like/like.ts';
import type { MarkersResolverByUserId } from '../domain/marker/marker.ts';
import type { MediaUploadResolver } from '../domain/mediaUpload/mediaUpload.ts';
import type { MutedActorIdsResolverByUserId, MutedActorsResolverByUserIdWithPagination } from '../domain/mute/mute.ts';
import type {
  NotificationCountResolverSinceMarker,
  NotificationIdsResolverByUserIdAndCreatedAt,
  NotificationResolverByUserIdAndId,
  NotificationsResolverByPage,
} from '../domain/notification/notification.ts';
import type { OAuthApplicationResolver } from '../domain/oauth/oauthApplication.ts';
import type { AccountStatusItemsResolverByActorId } from '../domain/post/accountStatusItem.ts';
import type {
  LocalPostsResolverByPage,
  PostsWithAuthorResolverByPostIds,
  ThreadResolver,
} from '../domain/post/post.ts';
import type { AllRelaysResolver } from '../domain/relay/relay.ts';
import type { RepostResolver, RepostResolverById } from '../domain/repost/repost.ts';
import type { SessionResolver } from '../domain/session/session.ts';
import type { TimelineItemsResolverByActorIds } from '../domain/timeline/timelineItem.ts';
import type { UserResolver, UserResolverByUsername } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { TextEmbedder } from '../ports/textEmbedder.ts';
import type { TextGenerator } from '../ports/textGenerator.ts';
import type { AddDigestTopicUseCase } from '../useCase/addDigestTopic.ts';
import type { AddFeedSourceUseCase } from '../useCase/addFeedSource.ts';
import type { ChangeDigestTopicEnabledUseCase } from '../useCase/changeDigestTopicEnabled.ts';
import type { ChangeFeedSourceEnabledUseCase } from '../useCase/changeFeedSourceEnabled.ts';
import type { ClearNotificationsUseCase } from '../useCase/clearNotifications.ts';
import type { CreateArticleUseCase } from '../useCase/createArticle.ts';
import type { CreateArticleWithBodyUseCase } from '../useCase/createArticleWithBody.ts';
import type { CreateMuteUseCase } from '../useCase/createMute.ts';
import type { createCreatePostUseCase } from '../useCase/createPost.ts';
import type { DeepDiveDigestItemUseCase } from '../useCase/deepDiveDigestItem.ts';
import type { DeleteArticleUseCase } from '../useCase/deleteArticle.ts';
import type { DeleteMuteUseCase } from '../useCase/deleteMute.ts';
import type { DeletePostUseCase } from '../useCase/deletePost.ts';
import type { DismissNotificationUseCase } from '../useCase/dismissNotification.ts';
import type { EditArticleUseCase } from '../useCase/editArticle.ts';
import type { EditDigestTopicUseCase } from '../useCase/editDigestTopic.ts';
import type { ExchangeTokenUseCase } from '../useCase/exchangeToken.ts';
import type { GetArticleForEditUseCase } from '../useCase/getArticleForEdit.ts';
import type { GetArticlesUseCase } from '../useCase/getArticles.ts';
import type { GetArticleWithThreadUseCase } from '../useCase/getArticleWithThread.ts';
import type { GetMediaUploadUseCase } from '../useCase/getMediaUpload.ts';
import type { createGetTimelineUseCase } from '../useCase/getTimeline.ts';
import type { GetXFeedEntriesUseCase } from '../useCase/getXFeedEntries.ts';
import type { GiveDigestItemFeedbackUseCase } from '../useCase/giveDigestItemFeedback.ts';
import type { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import type { IssueAuthorizationCodeUseCase } from '../useCase/issueAuthorizationCode.ts';
import type { PublishArticleUseCase } from '../useCase/publishArticle.ts';
import type { RegisterOAuthApplicationUseCase } from '../useCase/registerOAuthApplication.ts';
import type { RequestDigestUseCase } from '../useCase/requestDigest.ts';
import type { ResolveRemoteAccountUseCase } from '../useCase/resolveRemoteAccount.ts';
import type { RevokeTokenUseCase } from '../useCase/revokeToken.ts';
import type { SaveDigestSubscriptionUseCase } from '../useCase/saveDigestSubscription.ts';
import type { SaveMarkersUseCase } from '../useCase/saveMarkers.ts';
import type { SearchTimelineUseCase } from '../useCase/searchTimeline.ts';
import type { SendEmojiReactUseCase } from '../useCase/sendEmojiReact.ts';
import type { SendLikeUseCase } from '../useCase/sendLike.ts';
import type { SendReplyUseCase } from '../useCase/sendReply.ts';
import type { SendRepostUseCase } from '../useCase/sendRepost.ts';
import type { createSignInUseCase } from '../useCase/signIn.ts';
import type { createSignUpUseCase } from '../useCase/signUp.ts';
import type { SubscribePushUseCase } from '../useCase/subscribePush.ts';
import type { SubscribeRelayUseCase } from '../useCase/subscribeRelay.ts';
import type { SummarizeTimelineUseCase } from '../useCase/summarizeTimeline.ts';
import type { TranslatePostUseCase } from '../useCase/translatePost.ts';
import type { UndoEmojiReactUseCase } from '../useCase/undoEmojiReact.ts';
import type { UndoLikeUseCase } from '../useCase/undoLike.ts';
import type { UndoRepostUseCase } from '../useCase/undoRepost.ts';
import type { UnpublishArticleUseCase } from '../useCase/unpublishArticle.ts';
import type { UpdateArticleBodyUseCase } from '../useCase/updateArticleBody.ts';
import type { UpdateAvatarUseCase } from '../useCase/updateAvatar.ts';
import type { UpdateMediaDescriptionUseCase } from '../useCase/updateMediaDescription.ts';
import type { UploadMediaUseCase } from '../useCase/uploadMedia.ts';
import type { ValidateAuthorizationRequestUseCase } from '../useCase/validateAuthorizationRequest.ts';
import type { VerifyAccessTokenUseCase } from '../useCase/verifyAccessToken.ts';

export type WorkerRemoteActorAction = (
  input: Readonly<{
    userId: UserId;
    actorId: ActorId;
    ctx: Context<unknown>;
  }>,
) => ResultAsync<void, Readonly<{ message: string }>>;

export type UploadObjectStore = ReturnType<typeof createPostImageR2ObjectStore>;
export type IoriAuthRuntimePorts = Readonly<{
  signInUseCase: ReturnType<typeof createSignInUseCase>;
}>;
export type IoriOAuthRuntimePorts = Readonly<{
  registerOAuthApplicationUseCase: RegisterOAuthApplicationUseCase;
  validateAuthorizationRequestUseCase: ValidateAuthorizationRequestUseCase;
  issueAuthorizationCodeUseCase: IssueAuthorizationCodeUseCase;
  exchangeTokenUseCase: ExchangeTokenUseCase;
  revokeTokenUseCase: RevokeTokenUseCase;
  verifyAccessTokenUseCase: VerifyAccessTokenUseCase;
  oauthApplicationResolver: OAuthApplicationResolver;
  sessionResolver: SessionResolver;
}>;
export type IoriMastodonRuntimePorts = Readonly<{
  userResolver: UserResolver;
  userResolverByUsername: UserResolverByUsername;
  actorResolverByUserId: ActorResolverByUserId;
  actorResolverById: ActorResolverById;
  accountStatsResolver: AccountStatsResolverByActorId;
  actorsResolverByFollowerId: ActorsResolverByFollowerId;
  mutedActorIdsResolverByUserId: MutedActorIdsResolverByUserId;
  timelineItemsResolverByActorIds: TimelineItemsResolverByActorIds;
  localPostsResolverByPage: LocalPostsResolverByPage;
  accountStatusItemsResolverByActorId: AccountStatusItemsResolverByActorId;
  federatedTimelineItemsResolver: FederatedTimelineItemsResolver;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  repostResolverById: RepostResolverById;
  repostResolver: RepostResolver;
  threadResolver: ThreadResolver;
  actorIdsResolverByFollowerId: ActorIdsResolverByFollowerIdWithPagination;
  actorIdsResolverByFollowingId: ActorIdsResolverByFollowingIdWithPagination;
  actorIdResolverByAcct: ActorIdResolverByAcct;
  accountRelationshipsResolverByActorIds: AccountRelationshipsResolverByActorIds;
  likedPostIdsResolverByActorIdWithPagination: LikedPostIdsResolverByActorIdWithPagination;
  mutedActorsResolverByUserIdWithPagination: MutedActorsResolverByUserIdWithPagination;
  statusAssembler: StatusAssembler;
  searchTimeline: SearchTimelineUseCase;
  summarizeTimeline: SummarizeTimelineUseCase;
  translatePost: TranslatePostUseCase;
  notificationsResolverByPage: NotificationsResolverByPage;
  notificationResolverByUserIdAndId: NotificationResolverByUserIdAndId;
  notificationCountResolverSinceMarker: NotificationCountResolverSinceMarker;
  notificationIdsResolverByUserIdAndCreatedAt: NotificationIdsResolverByUserIdAndCreatedAt;
  markersResolverByUserId: MarkersResolverByUserId;
  saveMarkersUseCase: SaveMarkersUseCase;
  uploadMediaUseCase: UploadMediaUseCase;
  mediaUploadResolver: MediaUploadResolver;
  getMediaUploadUseCase: GetMediaUploadUseCase;
  updateMediaDescriptionUseCase: UpdateMediaDescriptionUseCase;
  updateAvatarUseCase: UpdateAvatarUseCase;
  dismissNotificationUseCase: DismissNotificationUseCase;
  clearNotificationsUseCase: ClearNotificationsUseCase;
  resolveRemoteAccountUseCase: ResolveRemoteAccountUseCase;
}>;
export type IoriDigestRuntimePorts = Readonly<{
  digestResolverByUserIdAndDigestDate: DigestResolverByUserIdAndDigestDate;
  digestResolverByUserId: DigestResolverByUserId;
  digestTopicEntriesResolverByUserIdAndDigestDate: DigestTopicEntriesResolverByUserIdAndDigestDate;
  timelineLinkTrendsResolverByUserId: TimelineLinkTrendsResolverByUserId;
  hatenaTrendsResolverByFetchedSince: HatenaTrendsResolverByFetchedSince;
  digestSubscriptionResolverByUserId: DigestSubscriptionResolverByUserId;
  saveDigestSubscriptionUseCase: SaveDigestSubscriptionUseCase;
  requestDigestUseCase: RequestDigestUseCase;
  giveDigestItemFeedbackUseCase: GiveDigestItemFeedbackUseCase;
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  addDigestTopicUseCase: AddDigestTopicUseCase;
  editDigestTopicUseCase: EditDigestTopicUseCase;
  changeDigestTopicEnabledUseCase: ChangeDigestTopicEnabledUseCase;
  deepDiveDigestItemUseCase: DeepDiveDigestItemUseCase;
  allFeedSourcesResolver: AllFeedSourcesResolver;
  addFeedSourceUseCase: AddFeedSourceUseCase;
  changeFeedSourceEnabledUseCase: ChangeFeedSourceEnabledUseCase;
  getXFeedEntriesUseCase: GetXFeedEntriesUseCase;
  isDigestOwner: IsDigestOwner;
}>;
export type IoriTimelineRuntimePorts = Readonly<{
  getTimelineUseCase: ReturnType<typeof createGetTimelineUseCase>;
}>;
export type IoriPostingRuntimePorts = Readonly<{
  createPostUseCase: ReturnType<typeof createCreatePostUseCase>;
}>;
export type IoriSocialActionsRuntimePorts = Readonly<{
  sendLikeUseCase: SendLikeUseCase;
  undoLikeUseCase: UndoLikeUseCase;
  sendRepostUseCase: SendRepostUseCase;
  undoRepostUseCase: UndoRepostUseCase;
  sendEmojiReactUseCase: SendEmojiReactUseCase;
  undoEmojiReactUseCase: UndoEmojiReactUseCase;
}>;
export type IoriArticlesRuntimePorts = Readonly<{
  getArticleWithThreadUseCase: GetArticleWithThreadUseCase;
  getArticlesUseCase: GetArticlesUseCase;
  createArticleUseCase: CreateArticleUseCase;
  createArticleWithBodyUseCase: CreateArticleWithBodyUseCase;
  updateArticleBodyUseCase: UpdateArticleBodyUseCase;
  getArticleForEditUseCase: GetArticleForEditUseCase;
  editArticleUseCase: EditArticleUseCase;
  articleBodyResolver: ArticleBodyResolver;
  publishArticleUseCase: PublishArticleUseCase;
  unpublishArticleUseCase: UnpublishArticleUseCase;
  deleteArticleUseCase: DeleteArticleUseCase;
  publishedArticlesResolver: PublishedArticlesWithAuthorResolver;
  digestHeadersResolverByArticleIds: DigestHeadersResolverByArticleIds;
  digestResolverByArticleId: DigestResolverByArticleId;
  actorResolverByUserId: ActorResolverByUserId;
  publishOgImage: (article: Article) => Promise<void>;
  deleteOgImage: (articleId: ArticleId) => Promise<void>;
}>;
export type IoriMutesRelaysRuntimePorts = Readonly<{
  createMuteUseCase: CreateMuteUseCase;
  deleteMuteUseCase: DeleteMuteUseCase;
  subscribeRelayUseCase: SubscribeRelayUseCase;
  allRelaysResolver: AllRelaysResolver;
}>;
export type IoriCoreRuntimePorts = Readonly<{
  signUpUseCase: ReturnType<typeof createSignUpUseCase>;
  sendReplyUseCase: SendReplyUseCase;
  deletePostUseCase: DeletePostUseCase;
  subscribePushUseCase: SubscribePushUseCase;
  followRemoteActor: WorkerRemoteActorAction;
  unfollowRemoteActor: WorkerRemoteActorAction;
  vapidPublicKey: string | undefined;
}>;

export type IoriRuntimePorts = Readonly<{
  db: IoriD1Db;
  auth: IoriAuthRuntimePorts;
  oauth: IoriOAuthRuntimePorts;
  mastodon: IoriMastodonRuntimePorts;
  digest: IoriDigestRuntimePorts;
  timeline: IoriTimelineRuntimePorts;
  posting: IoriPostingRuntimePorts;
  socialActions: IoriSocialActionsRuntimePorts;
  articles: IoriArticlesRuntimePorts;
  mutesRelays: IoriMutesRelaysRuntimePorts;
  core: IoriCoreRuntimePorts;
  uploads: UploadObjectStore;
  federation: Federation<void>;
  textGenerator?: TextGenerator;
  textEmbedder?: TextEmbedder;
}>;

/** Worker-facing alias used to make the runtime boundary explicit. */
export type WorkerRuntimePorts = IoriRuntimePorts;
