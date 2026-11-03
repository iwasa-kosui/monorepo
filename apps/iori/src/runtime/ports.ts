import type { Context, Federation } from '@fedify/fedify';
import type { RA, ResultAsync } from '@iwasa-kosui/result';

import type { ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import type { StatusAssembler } from '../adaptor/mastodon/statusAssembler.ts';
import type { createPostImageR2ObjectStore } from '../adaptor/r2/postImageObjectStore.ts';
import type {
  ActorIdsResolverByFollowerIdWithPagination,
  ActorIdsResolverByFollowingIdWithPagination,
} from '../domain/actor/accountProfile.ts';
import type { AccountStatsResolverByActorId } from '../domain/actor/accountStats.ts';
import type { ActorResolverByUserId, ActorsResolverByFollowerId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { RemoteActor } from '../domain/actor/remoteActor.ts';
import type { Article, PublishedArticlesWithAuthorResolver } from '../domain/article/article.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import type { FederatedTimelineItemsResolver } from '../domain/federatedTimeline/federatedTimelineItem.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { MutedActorIdsResolverByUserId } from '../domain/mute/mute.ts';
import type { OAuthApplicationResolver } from '../domain/oauth/oauthApplication.ts';
import type { AccountStatusItemsResolverByActorId } from '../domain/post/accountStatusItem.ts';
import type {
  LocalPostsResolverByPage,
  PostsWithAuthorResolverByPostIds,
  PostWithAuthor,
  ThreadResolver,
} from '../domain/post/post.ts';
import type { AllRelaysResolver } from '../domain/relay/relay.ts';
import type { RepostResolverById } from '../domain/repost/repost.ts';
import type { SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { TimelineItemsResolverByActorIds } from '../domain/timeline/timelineItem.ts';
import type { UserResolver, UserResolverByUsername } from '../domain/user/user.ts';
import type { CreateArticleUseCase } from '../useCase/createArticle.ts';
import type { CreateMuteUseCase } from '../useCase/createMute.ts';
import type { createCreatePostUseCase } from '../useCase/createPost.ts';
import type { DeleteArticleUseCase } from '../useCase/deleteArticle.ts';
import type { DeleteMuteUseCase } from '../useCase/deleteMute.ts';
import type { DeletePostUseCase } from '../useCase/deletePost.ts';
import type { ExchangeTokenUseCase } from '../useCase/exchangeToken.ts';
import type { GetArticlesUseCase } from '../useCase/getArticles.ts';
import type { GetArticleWithThreadUseCase } from '../useCase/getArticleWithThread.ts';
import type { GetLikedPostsUseCase } from '../useCase/getLikedPosts.ts';
import type { GetMutesUseCase } from '../useCase/getMutes.ts';
import type { GetNotificationsUseCase } from '../useCase/getNotifications.ts';
import type { createGetTimelineUseCase } from '../useCase/getTimeline.ts';
import type { GetUnreadNotificationCountUseCase } from '../useCase/getUnreadNotificationCount.ts';
import type { GetUserPostsUseCase } from '../useCase/getUserPosts.ts';
import type { IssueAuthorizationCodeUseCase } from '../useCase/issueAuthorizationCode.ts';
import type { PublishArticleUseCase } from '../useCase/publishArticle.ts';
import type { RegisterOAuthApplicationUseCase } from '../useCase/registerOAuthApplication.ts';
import type { RevokeTokenUseCase } from '../useCase/revokeToken.ts';
import type { SendEmojiReactUseCase } from '../useCase/sendEmojiReact.ts';
import type { SendFollowRequestUseCase } from '../useCase/sendFollowRequest.ts';
import type { SendLikeUseCase } from '../useCase/sendLike.ts';
import type { SendReplyUseCase } from '../useCase/sendReply.ts';
import type { SendRepostUseCase } from '../useCase/sendRepost.ts';
import type { createSignInUseCase } from '../useCase/signIn.ts';
import type { createSignUpUseCase } from '../useCase/signUp.ts';
import type { SubscribePushUseCase } from '../useCase/subscribePush.ts';
import type { SubscribeRelayUseCase } from '../useCase/subscribeRelay.ts';
import type { UndoEmojiReactUseCase } from '../useCase/undoEmojiReact.ts';
import type { UndoLikeUseCase } from '../useCase/undoLike.ts';
import type { UndoRepostUseCase } from '../useCase/undoRepost.ts';
import type { UnpublishArticleUseCase } from '../useCase/unpublishArticle.ts';
import type { UnsubscribePushUseCase } from '../useCase/unsubscribePush.ts';
import type { ValidateAuthorizationRequestUseCase } from '../useCase/validateAuthorizationRequest.ts';
import type { VerifyAccessTokenUseCase } from '../useCase/verifyAccessToken.ts';

export type WorkerRemoteActorAction = (
  input: Readonly<{
    sessionId: SessionId;
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
  threadResolver: ThreadResolver;
  actorIdsResolverByFollowerId: ActorIdsResolverByFollowerIdWithPagination;
  actorIdsResolverByFollowingId: ActorIdsResolverByFollowingIdWithPagination;
  statusAssembler: StatusAssembler;
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
export type IoriNotificationsRuntimePorts = Readonly<{
  getUnreadNotificationCountUseCase: GetUnreadNotificationCountUseCase;
  getNotificationsUseCase: GetNotificationsUseCase;
  getLikedPostsUseCase: GetLikedPostsUseCase;
}>;
export type IoriArticlesRuntimePorts = Readonly<{
  getArticleWithThreadUseCase: GetArticleWithThreadUseCase;
  getArticlesUseCase: GetArticlesUseCase;
  createArticleUseCase: CreateArticleUseCase;
  publishArticleUseCase: PublishArticleUseCase;
  unpublishArticleUseCase: UnpublishArticleUseCase;
  deleteArticleUseCase: DeleteArticleUseCase;
  publishedArticlesResolver: PublishedArticlesWithAuthorResolver;
  sessionResolver: SessionResolver;
  publishOgImage: (article: Article) => Promise<void>;
  deleteOgImage: (articleId: ArticleId) => Promise<void>;
}>;
export type IoriMutesRelaysRuntimePorts = Readonly<{
  getMutesUseCase: GetMutesUseCase;
  createMuteUseCase: CreateMuteUseCase;
  deleteMuteUseCase: DeleteMuteUseCase;
  subscribeRelayUseCase: SubscribeRelayUseCase;
  allRelaysResolver: AllRelaysResolver;
}>;
export type IoriCoreRuntimePorts = Readonly<{
  signUpUseCase: ReturnType<typeof createSignUpUseCase>;
  sendReplyUseCase: SendReplyUseCase;
  deletePostUseCase: DeletePostUseCase;
  sendFollowRequestUseCase: SendFollowRequestUseCase;
  getUserPostsUseCase: GetUserPostsUseCase;
  getRemoteActorPostsUseCase: Readonly<{
    run: (
      input: Readonly<{
        sessionId: SessionId;
        actorId: ActorId;
        createdAt: Instant | undefined;
      }>,
    ) => RA<
      Readonly<{
        remoteActor: RemoteActor;
        isFollowing: boolean;
        isMuted: boolean;
        posts: readonly PostWithAuthor[];
      }>,
      { message: string }
    >;
  }>;
  subscribePushUseCase: SubscribePushUseCase;
  unsubscribePushUseCase: UnsubscribePushUseCase;
  followRemoteActor: WorkerRemoteActorAction;
  unfollowRemoteActor: WorkerRemoteActorAction;
  vapidPublicKey: string | undefined;
}>;

export type IoriRuntimePorts = Readonly<{
  db: IoriD1Db;
  auth: IoriAuthRuntimePorts;
  oauth: IoriOAuthRuntimePorts;
  mastodon: IoriMastodonRuntimePorts;
  timeline: IoriTimelineRuntimePorts;
  posting: IoriPostingRuntimePorts;
  socialActions: IoriSocialActionsRuntimePorts;
  notifications: IoriNotificationsRuntimePorts;
  articles: IoriArticlesRuntimePorts;
  mutesRelays: IoriMutesRelaysRuntimePorts;
  core: IoriCoreRuntimePorts;
  uploads: UploadObjectStore;
  federation: Federation<void>;
}>;

/** Worker-facing alias used to make the runtime boundary explicit. */
export type WorkerRuntimePorts = IoriRuntimePorts;
