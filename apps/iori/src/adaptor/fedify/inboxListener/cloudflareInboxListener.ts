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
import { createD1ActorResolverByUri } from '../../d1/actor/actorResolverByUri.ts';
import { createD1ActorResolverByUserId } from '../../d1/actor/actorResolverByUserId.ts';
import { createD1LogoUriUpdatedStore } from '../../d1/actor/logoUriUpdatedStore.ts';
import { createD1RemoteActorCreatedStore } from '../../d1/actor/remoteActorCreatedStore.ts';
import type { IoriD1Db } from '../../d1/client.ts';
import { createD1EmojiReactCreatedStore } from '../../d1/emojiReact/emojiReactCreatedStore.ts';
import { createD1EmojiReactDeletedStore } from '../../d1/emojiReact/emojiReactDeletedStore.ts';
import { createD1EmojiReactResolverByActivityUri } from '../../d1/emojiReact/emojiReactResolverByActivityUri.ts';
import { createD1EmojiReactsResolverByPostId } from '../../d1/emojiReact/emojiReactsResolverByPostId.ts';
import { createD1FederatedTimelineItemCreatedStore } from '../../d1/federatedTimeline/federatedTimelineItemCreatedStore.ts';
import { createD1FederatedTimelineItemDeletedStore } from '../../d1/federatedTimeline/federatedTimelineItemDeletedStore.ts';
import { createD1FederatedTimelineItemResolverByPostId } from '../../d1/federatedTimeline/federatedTimelineItemResolverByPostId.ts';
import { createD1FederatedTimelineItemsResolverByPostId } from '../../d1/federatedTimeline/federatedTimelineItemsResolverByPostId.ts';
import { createD1FollowAcceptedStore } from '../../d1/follow/followAcceptedStore.ts';
import { createD1FollowResolver } from '../../d1/follow/followResolver.ts';
import { createD1UndoFollowingProcessedStore } from '../../d1/follow/undoFollowingProcessedStore.ts';
import { createD1PostImageCreatedStore } from '../../d1/image/postImageCreatedStore.ts';
import { createD1LikesResolverByPostId } from '../../d1/like/likesResolverByPostId.ts';
import { createD1LocalLikeDeletedStore } from '../../d1/like/localLikeDeletedStore.ts';
import { createD1RemoteLikeCreatedStore } from '../../d1/like/remoteLikeCreatedStore.ts';
import { createD1RemoteLikeDeletedStore } from '../../d1/like/remoteLikeDeletedStore.ts';
import { createD1RemoteLikeResolverByActivityUri } from '../../d1/like/remoteLikeResolverByActivityUri.ts';
import { createD1LinkPreviewCreatedStore } from '../../d1/linkPreview/linkPreviewCreatedStore.ts';
import {
  createD1EmojiReactNotificationCreatedStore,
  createD1EmojiReactNotificationDeletedStore,
  createD1EmojiReactNotificationsResolverByPostId,
  createD1FollowNotificationCreatedStore,
  createD1LikeNotificationCreatedStore,
  createD1LikeNotificationDeletedStore,
  createD1LikeNotificationsResolverByPostId,
  createD1ReplyNotificationCreatedStore,
  createD1ReplyNotificationDeletedStore,
  createD1ReplyNotificationsResolverByOriginalPostId,
  createD1ReplyNotificationsResolverByReplyPostId,
} from '../../d1/notification/inboxNotificationAdapters.ts';
import { createD1LocalPostResolverByUri } from '../../d1/post/localPostResolverByUri.ts';
import { createD1PostCreatedStore } from '../../d1/post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../../d1/post/postDeletedStore.ts';
import { createD1PostResolver } from '../../d1/post/postResolver.ts';
import { createD1PostResolverByUri } from '../../d1/post/postResolverByUri.ts';
import { createD1RemotePostUpserter } from '../../d1/post/remotePostUpserter.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../../d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1RelayResolverByActorUri } from '../../d1/relay/relayResolverByActorUri.ts';
import { createD1RelaySubscriptionAcceptedStore } from '../../d1/relay/relaySubscriptionAcceptedStore.ts';
import { createD1RepostCreatedStore } from '../../d1/repost/repostCreatedStore.ts';
import { createD1RepostDeletedStore } from '../../d1/repost/repostDeletedStore.ts';
import { createD1RepostResolverByActivityUri } from '../../d1/repost/repostResolverByActivityUri.ts';
import { createD1RepostsResolverByPostId } from '../../d1/repost/repostsResolverByPostId.ts';
import { createD1TimelineItemCreatedStore } from '../../d1/timeline/timelineItemCreatedStore.ts';
import { createD1TimelineItemDeletedStore } from '../../d1/timeline/timelineItemDeletedStore.ts';
import { createD1TimelineItemsResolverByPostId } from '../../d1/timeline/timelineItemsResolverByPostId.ts';
import { createD1UserResolverByUsername } from '../../d1/user/userResolverByUsername.ts';
import { createOgpFetcher } from '../../ogp/ogpFetcher.ts';
import { createCloudflareWebPushSender } from '../../webPush/cloudflareWebPushSender.ts';
import { InboxActorResolver } from '../inboxActorResolver.ts';
import { createInboxListener } from './inboxListenerFactory.ts';

type CloudflareInboxListenerConfig = Readonly<{
  origin: string;
  vapidSubject: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
}>;

export const createCloudflareInboxListener = (db: IoriD1Db, config: CloudflareInboxListenerConfig) => {
  const { origin } = config;
  const inboxActorResolver = InboxActorResolver.getInstance();
  const actorResolverByUri = createD1ActorResolverByUri(db);
  const actorResolverByUserId = createD1ActorResolverByUserId(db);
  const remoteActorCreatedStore = createD1RemoteActorCreatedStore(db);
  const logoUriUpdatedStore = createD1LogoUriUpdatedStore(db);
  const postResolver = createD1PostResolver(db);
  const postResolverByUri = createD1PostResolverByUri(db);
  const postCreatedStore = createD1PostCreatedStore(db);
  const localPostResolverByUri = createD1LocalPostResolverByUri(db, origin);
  const remotePostUpserter = createD1RemotePostUpserter({
    postResolverByUri,
    postCreatedStore,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    actorResolverByUri,
  });
  const pushSubscriptionsResolver = createD1PushSubscriptionsResolverByUserId(db);
  const webPushSender = createCloudflareWebPushSender({
    subject: config.vapidSubject,
    publicKey: config.vapidPublicKey,
    privateKey: config.vapidPrivateKey,
  });
  const emojiReactCreatedStore = createD1EmojiReactCreatedStore(db);
  const emojiReactResolverByActivityUri = createD1EmojiReactResolverByActivityUri(db);
  const emojiReactNotificationCreatedStore = createD1EmojiReactNotificationCreatedStore(db);
  const timelineItemCreatedStore = createD1TimelineItemCreatedStore(db);

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
    remoteLikeCreatedStore: createD1RemoteLikeCreatedStore(db),
    remoteLikeResolverByActivityUri: createD1RemoteLikeResolverByActivityUri(db),
    likeNotificationCreatedStore: createD1LikeNotificationCreatedStore(db),
    postResolver,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    actorResolverByUri,
    pushSubscriptionsResolver,
    webPushSender,
  });
  const addReceivedRepostUseCase = AddReceivedRepostUseCase.create({
    repostCreatedStore: createD1RepostCreatedStore(db),
    repostResolverByActivityUri: createD1RepostResolverByActivityUri(db),
    postResolver,
    remotePostUpserter,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    actorResolverByUri,
    timelineItemCreatedStore,
  });

  return createInboxListener({
    onAccept: {
      inboxActorResolver,
      acceptRelaySubscriptionUseCase: AcceptRelaySubscriptionUseCase.create({
        relayResolverByActorUri: createD1RelayResolverByActorUri(db),
        relaySubscriptionAcceptedStore: createD1RelaySubscriptionAcceptedStore(db),
      }),
      actorResolverByUri,
      followResolver: createD1FollowResolver(db),
      followAcceptedStore: createD1FollowAcceptedStore(db),
    },
    onFollow: {
      inboxActorResolver,
      acceptFollowRequestUseCase: AcceptFollowRequestUseCase.create({
        followedStore: createD1FollowAcceptedStore(db),
        followResolver: createD1FollowResolver(db),
        actorResolverByUri,
        actorResolverByUserId,
        remoteActorCreatedStore,
        userResolverByUsername: createD1UserResolverByUsername(db),
        logoUriUpdatedStore,
        followNotificationCreatedStore: createD1FollowNotificationCreatedStore(db),
        pushSubscriptionsResolver,
        webPushSender,
      }),
    },
    onUndo: {
      acceptUnfollowUseCase: AcceptUnfollowUseCase.create({
        unfollowedStore: createD1UndoFollowingProcessedStore(db),
        followResolver: createD1FollowResolver(db),
        actorResolverByUri,
        actorResolverByUserId,
        userResolverByUsername: createD1UserResolverByUsername(db),
      }),
      removeReceivedLikeUseCase: RemoveReceivedLikeUseCase.create({
        remoteLikeDeletedStore: createD1RemoteLikeDeletedStore(db),
        remoteLikeResolverByActivityUri: createD1RemoteLikeResolverByActivityUri(db),
      }),
      removeReceivedRepostUseCase: RemoveReceivedRepostUseCase.create({
        repostDeletedStore: createD1RepostDeletedStore(db),
        repostResolverByActivityUri: createD1RepostResolverByActivityUri(db),
      }),
      removeReceivedEmojiReactUseCase: RemoveReceivedEmojiReactUseCase.create({
        emojiReactDeletedStore: createD1EmojiReactDeletedStore(db),
        emojiReactResolverByActivityUri,
      }),
    },
    onCreate: {
      inboxActorResolver,
      addRemotePostUseCase: AddRemotePostUseCase.create({
        origin,
        postCreatedStore,
        postImageCreatedStore: createD1PostImageCreatedStore(db),
        remoteActorCreatedStore,
        logoUriUpdatedStore,
        actorResolverByUri,
        timelineItemCreatedStore,
        localPostResolverByUri,
        replyNotificationCreatedStore: createD1ReplyNotificationCreatedStore(db),
        pushSubscriptionsResolver,
        webPushSender,
        linkPreviewCreatedStore: createD1LinkPreviewCreatedStore(db),
        ogpFetcher: createOgpFetcher(),
      }),
      fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase.create({
        postResolverByUri,
        localPostResolverByUri,
        remotePostUpserter,
      }),
    },
    onDelete: {
      remotePostResolverByUri: postResolverByUri,
      timelineItemsResolverByPostId: createD1TimelineItemsResolverByPostId(db),
      likeNotificationsResolverByPostId: createD1LikeNotificationsResolverByPostId(db),
      emojiReactNotificationsResolverByPostId: createD1EmojiReactNotificationsResolverByPostId(db),
      replyNotificationsResolverByReplyPostId: createD1ReplyNotificationsResolverByReplyPostId(db),
      replyNotificationsResolverByOriginalPostId: createD1ReplyNotificationsResolverByOriginalPostId(db),
      repostsResolverByPostId: createD1RepostsResolverByPostId(db),
      likesResolverByPostId: createD1LikesResolverByPostId(db),
      emojiReactsResolverByPostId: createD1EmojiReactsResolverByPostId(db),
      federatedTimelineItemsResolverByPostId: createD1FederatedTimelineItemsResolverByPostId(db),
      timelineItemDeletedStore: createD1TimelineItemDeletedStore(db),
      likeNotificationDeletedStore: createD1LikeNotificationDeletedStore(db),
      emojiReactNotificationDeletedStore: createD1EmojiReactNotificationDeletedStore(db),
      replyNotificationDeletedStore: createD1ReplyNotificationDeletedStore(db),
      repostDeletedStore: createD1RepostDeletedStore(db),
      localLikeDeletedStore: createD1LocalLikeDeletedStore(db),
      remoteLikeDeletedStore: createD1RemoteLikeDeletedStore(db),
      emojiReactDeletedStore: createD1EmojiReactDeletedStore(db),
      federatedTimelineItemDeletedStore: createD1FederatedTimelineItemDeletedStore(db),
      postDeletedStore: createD1PostDeletedStore(db),
    },
    onLike: { inboxActorResolver, addReceivedEmojiReactUseCase, addReceivedLikeUseCase },
    onAnnounce: {
      relayResolverByActorUri: createD1RelayResolverByActorUri(db),
      inboxActorResolver,
      addReceivedRepostUseCase,
      remotePostUpserter,
      federatedTimelineItemResolverByPostId: createD1FederatedTimelineItemResolverByPostId(db),
      federatedTimelineItemCreatedStore: createD1FederatedTimelineItemCreatedStore(db),
    },
    onActivity: { inboxActorResolver, addReceivedEmojiReactUseCase },
  });
};
