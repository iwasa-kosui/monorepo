import { Env } from '../../../env.ts';
import { singleton } from '../../../helper/singleton.ts';
import { AcceptFollowRequestUseCase } from '../../../useCase/acceptFollowRequest.ts';
import { AcceptRelaySubscriptionUseCase } from '../../../useCase/acceptRelaySubscription.ts';
import { AcceptUnfollowUseCase } from '../../../useCase/acceptUnfollow.ts';
import { AddReceivedEmojiReactUseCase } from '../../../useCase/addReceivedEmojiReact.ts';
import { AddReceivedLikeUseCase } from '../../../useCase/addReceivedLike.ts';
import { AddReceivedRepostUseCase } from '../../../useCase/addReceivedRepost.ts';
import { AddRemotePostUseCase } from '../../../useCase/addRemotePost.ts';
import { FetchReplyNotesRecursiveUseCase } from '../../../useCase/fetchReplyNotesRecursive.ts';
import { RemoveReceivedEmojiReactUseCase } from '../../../useCase/removeReceivedEmojiReact.ts';
import { RemoveReceivedLikeUseCase } from '../../../useCase/removeReceivedLike.ts';
import { RemoveReceivedRepostUseCase } from '../../../useCase/removeReceivedRepost.ts';
import { createOgpFetcher } from '../../ogp/ogpFetcher.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgActorResolverByUserId } from '../../pg/actor/actorResolverByUserId.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgEmojiReactCreatedStore } from '../../pg/emojiReact/emojiReactCreatedStore.ts';
import { PgEmojiReactDeletedStore } from '../../pg/emojiReact/emojiReactDeletedStore.ts';
import { PgEmojiReactResolverByActivityUri } from '../../pg/emojiReact/emojiReactResolverByActivityUri.ts';
import { PgEmojiReactsResolverByPostId } from '../../pg/emojiReact/emojiReactsResolverByPostId.ts';
import { PgFederatedTimelineItemCreatedStore } from '../../pg/federatedTimeline/federatedTimelineItemCreatedStore.ts';
import { PgFederatedTimelineItemDeletedStore } from '../../pg/federatedTimeline/federatedTimelineItemDeletedStore.ts';
import { PgFederatedTimelineItemResolverByPostId } from '../../pg/federatedTimeline/federatedTimelineItemResolverByPostId.ts';
import { PgFederatedTimelineItemsResolverByPostId } from '../../pg/federatedTimeline/federatedTimelineItemsResolverByPostId.ts';
import { PgFollowedStore } from '../../pg/follow/followAcceptedStore.ts';
import { PgFollowResolver } from '../../pg/follow/followResolver.ts';
import { PgUnfollowedStore } from '../../pg/follow/undoFollowingProcessedStore.ts';
import { PgPostImageCreatedStore } from '../../pg/image/postImageCreatedStore.ts';
import { PgLikesResolverByPostId } from '../../pg/like/likesResolverByPostId.ts';
import { PgLocalLikeDeletedStore } from '../../pg/like/localLikeDeletedStore.ts';
import { PgRemoteLikeCreatedStore } from '../../pg/like/remoteLikeCreatedStore.ts';
import { PgRemoteLikeDeletedStore } from '../../pg/like/remoteLikeDeletedStore.ts';
import { PgRemoteLikeResolverByActivityUri } from '../../pg/like/remoteLikeResolverByActivityUri.ts';
import { PgLinkPreviewCreatedStore } from '../../pg/linkPreview/linkPreviewCreatedStore.ts';
import { PgEmojiReactNotificationCreatedStore } from '../../pg/notification/emojiReactNotificationCreatedStore.ts';
import { PgEmojiReactNotificationDeletedStore } from '../../pg/notification/emojiReactNotificationDeletedStore.ts';
import { PgEmojiReactNotificationsResolverByPostId } from '../../pg/notification/emojiReactNotificationsResolverByPostId.ts';
import { PgFollowNotificationCreatedStore } from '../../pg/notification/followNotificationCreatedStore.ts';
import { PgLikeNotificationDeletedStore } from '../../pg/notification/likeNotificationDeletedStore.ts';
import { PgLikeNotificationsResolverByPostId } from '../../pg/notification/likeNotificationsResolverByPostId.ts';
import { PgLikeNotificationCreatedStore } from '../../pg/notification/notificationCreatedStore.ts';
import { PgReplyNotificationCreatedStore } from '../../pg/notification/replyNotificationCreatedStore.ts';
import { PgReplyNotificationDeletedStore } from '../../pg/notification/replyNotificationDeletedStore.ts';
import { PgReplyNotificationsResolverByOriginalPostId } from '../../pg/notification/replyNotificationsResolverByOriginalPostId.ts';
import { PgReplyNotificationsResolverByReplyPostId } from '../../pg/notification/replyNotificationsResolverByReplyPostId.ts';
import { PgLocalPostResolverByUri } from '../../pg/post/localPostResolverByUri.ts';
import { PgPostCreatedStore } from '../../pg/post/postCreatedStore.ts';
import { PgPostDeletedStore } from '../../pg/post/postDeletedStore.ts';
import { PgPostResolver } from '../../pg/post/postResolver.ts';
import { PgPostResolverByUri } from '../../pg/post/postResolverByUri.ts';
import { PgRemotePostUpserter } from '../../pg/post/remotePostUpserter.ts';
import { PgPushSubscriptionsResolverByUserId } from '../../pg/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { PgRelayResolverByActorUri } from '../../pg/relay/relayResolverByActorUri.ts';
import { PgRelaySubscriptionAcceptedStore } from '../../pg/relay/relaySubscriptionAcceptedStore.ts';
import { PgRepostCreatedStore } from '../../pg/repost/repostCreatedStore.ts';
import { PgRepostDeletedStore } from '../../pg/repost/repostDeletedStore.ts';
import { PgRepostResolverByActivityUri } from '../../pg/repost/repostResolverByActivityUri.ts';
import { PgRepostsResolverByPostId } from '../../pg/repost/repostsResolverByPostId.ts';
import { PgTimelineItemCreatedStore } from '../../pg/timeline/timelineItemCreatedStore.ts';
import { PgTimelineItemDeletedStore } from '../../pg/timeline/timelineItemDeletedStore.ts';
import { PgTimelineItemsResolverByPostId } from '../../pg/timeline/timelineItemsResolverByPostId.ts';
import { PgUserResolverByUsername } from '../../pg/user/userResolverByUsername.ts';
import { WebPushSender } from '../../webPush/webPushSender.ts';
import { InboxActorResolver } from '../inboxActorResolver.ts';
import { createInboxListener } from './inboxListenerFactory.ts';

const create = () => {
  const actorResolverByUri = PgActorResolverByUri.getInstance();
  const actorResolverByUserId = PgActorResolverByUserId.getInstance();
  const remoteActorCreatedStore = PgRemoteActorCreatedStore.getInstance();
  const logoUriUpdatedStore = PgLogoUriUpdatedStore.getInstance();
  const postResolver = PgPostResolver.getInstance();
  const remotePostUpserter = PgRemotePostUpserter.getInstance();
  const pushSubscriptionsResolver = PgPushSubscriptionsResolverByUserId.getInstance();
  const webPushSender = WebPushSender.getInstance();
  const emojiReactCreatedStore = PgEmojiReactCreatedStore.getInstance();
  const emojiReactResolverByActivityUri = PgEmojiReactResolverByActivityUri.getInstance();
  const emojiReactNotificationCreatedStore = PgEmojiReactNotificationCreatedStore.getInstance();
  const inboxActorResolver = InboxActorResolver.getInstance();

  const addReceivedEmojiReactUseCase = AddReceivedEmojiReactUseCase.create({
    emojiReactCreatedStore,
    emojiReactResolverByActivityUri,
    emojiReactNotificationCreatedStore,
    postResolver,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    actorResolverByUri,
    pushSubscriptionsResolver,
    webPushSender,
  });
  const addReceivedLikeUseCase = AddReceivedLikeUseCase.create({
    remoteLikeCreatedStore: PgRemoteLikeCreatedStore.getInstance(),
    remoteLikeResolverByActivityUri: PgRemoteLikeResolverByActivityUri.getInstance(),
    likeNotificationCreatedStore: PgLikeNotificationCreatedStore.getInstance(),
    postResolver,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    actorResolverByUri,
    pushSubscriptionsResolver,
    webPushSender,
  });
  const addReceivedRepostUseCase = AddReceivedRepostUseCase.create({
    repostCreatedStore: PgRepostCreatedStore.getInstance(),
    repostResolverByActivityUri: PgRepostResolverByActivityUri.getInstance(),
    postResolver,
    remotePostUpserter,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    actorResolverByUri,
    timelineItemCreatedStore: PgTimelineItemCreatedStore.getInstance(),
  });

  return createInboxListener({
    onAccept: {
      inboxActorResolver,
      acceptRelaySubscriptionUseCase: AcceptRelaySubscriptionUseCase.create({
        relayResolverByActorUri: PgRelayResolverByActorUri.getInstance(),
        relaySubscriptionAcceptedStore: PgRelaySubscriptionAcceptedStore.getInstance(),
      }),
      actorResolverByUri,
      followResolver: PgFollowResolver.getInstance(),
      followAcceptedStore: PgFollowedStore.getInstance(),
    },
    onFollow: {
      inboxActorResolver,
      acceptFollowRequestUseCase: AcceptFollowRequestUseCase.create({
        followedStore: PgFollowedStore.getInstance(),
        followResolver: PgFollowResolver.getInstance(),
        actorResolverByUri,
        actorResolverByUserId,
        remoteActorCreatedStore,
        userResolverByUsername: PgUserResolverByUsername.getInstance(),
        logoUriUpdatedStore,
        followNotificationCreatedStore: PgFollowNotificationCreatedStore.getInstance(),
        pushSubscriptionsResolver,
        webPushSender,
      }),
    },
    onUndo: {
      acceptUnfollowUseCase: AcceptUnfollowUseCase.create({
        unfollowedStore: PgUnfollowedStore.getInstance(),
        followResolver: PgFollowResolver.getInstance(),
        actorResolverByUri,
        actorResolverByUserId,
        userResolverByUsername: PgUserResolverByUsername.getInstance(),
      }),
      removeReceivedLikeUseCase: RemoveReceivedLikeUseCase.create({
        remoteLikeDeletedStore: PgRemoteLikeDeletedStore.getInstance(),
        remoteLikeResolverByActivityUri: PgRemoteLikeResolverByActivityUri.getInstance(),
      }),
      removeReceivedRepostUseCase: RemoveReceivedRepostUseCase.create({
        repostDeletedStore: PgRepostDeletedStore.getInstance(),
        repostResolverByActivityUri: PgRepostResolverByActivityUri.getInstance(),
      }),
      removeReceivedEmojiReactUseCase: RemoveReceivedEmojiReactUseCase.create({
        emojiReactDeletedStore: PgEmojiReactDeletedStore.getInstance(),
        emojiReactResolverByActivityUri,
      }),
    },
    onCreate: {
      inboxActorResolver,
      addRemotePostUseCase: AddRemotePostUseCase.create({
        origin: Env.getInstance().ORIGIN,
        postCreatedStore: PgPostCreatedStore.getInstance(),
        postImageCreatedStore: PgPostImageCreatedStore.getInstance(),
        remoteActorCreatedStore,
        logoUriUpdatedStore,
        actorResolverByUri,
        timelineItemCreatedStore: PgTimelineItemCreatedStore.getInstance(),
        localPostResolverByUri: PgLocalPostResolverByUri.getInstance(),
        replyNotificationCreatedStore: PgReplyNotificationCreatedStore.getInstance(),
        pushSubscriptionsResolver,
        webPushSender,
        linkPreviewCreatedStore: PgLinkPreviewCreatedStore.getInstance(),
        ogpFetcher: createOgpFetcher(),
      }),
      fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase.create({
        postResolverByUri: PgPostResolverByUri.getInstance(),
        localPostResolverByUri: PgLocalPostResolverByUri.getInstance(),
        remotePostUpserter,
      }),
    },
    onDelete: {
      remotePostResolverByUri: PgPostResolverByUri.getInstance(),
      timelineItemsResolverByPostId: PgTimelineItemsResolverByPostId.getInstance(),
      likeNotificationsResolverByPostId: PgLikeNotificationsResolverByPostId.getInstance(),
      emojiReactNotificationsResolverByPostId: PgEmojiReactNotificationsResolverByPostId.getInstance(),
      replyNotificationsResolverByReplyPostId: PgReplyNotificationsResolverByReplyPostId.getInstance(),
      replyNotificationsResolverByOriginalPostId: PgReplyNotificationsResolverByOriginalPostId.getInstance(),
      repostsResolverByPostId: PgRepostsResolverByPostId.getInstance(),
      likesResolverByPostId: PgLikesResolverByPostId.getInstance(),
      emojiReactsResolverByPostId: PgEmojiReactsResolverByPostId.getInstance(),
      federatedTimelineItemsResolverByPostId: PgFederatedTimelineItemsResolverByPostId.getInstance(),
      timelineItemDeletedStore: PgTimelineItemDeletedStore.getInstance(),
      likeNotificationDeletedStore: PgLikeNotificationDeletedStore.getInstance(),
      emojiReactNotificationDeletedStore: PgEmojiReactNotificationDeletedStore.getInstance(),
      replyNotificationDeletedStore: PgReplyNotificationDeletedStore.getInstance(),
      repostDeletedStore: PgRepostDeletedStore.getInstance(),
      localLikeDeletedStore: PgLocalLikeDeletedStore.getInstance(),
      remoteLikeDeletedStore: PgRemoteLikeDeletedStore.getInstance(),
      emojiReactDeletedStore: PgEmojiReactDeletedStore.getInstance(),
      federatedTimelineItemDeletedStore: PgFederatedTimelineItemDeletedStore.getInstance(),
      postDeletedStore: PgPostDeletedStore.getInstance(),
    },
    onLike: { inboxActorResolver, addReceivedEmojiReactUseCase, addReceivedLikeUseCase },
    onAnnounce: {
      relayResolverByActorUri: PgRelayResolverByActorUri.getInstance(),
      inboxActorResolver,
      addReceivedRepostUseCase,
      remotePostUpserter,
      federatedTimelineItemResolverByPostId: PgFederatedTimelineItemResolverByPostId.getInstance(),
      federatedTimelineItemCreatedStore: PgFederatedTimelineItemCreatedStore.getInstance(),
    },
    onActivity: { inboxActorResolver, addReceivedEmojiReactUseCase },
  });
};

export const InboxListener = { getInstance: singleton(create) } as const;
