import { AcceptBlockUseCase } from '../../../useCase/acceptBlock.ts';
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
import { UpdateRemotePostUseCase } from '../../../useCase/updateRemotePost.ts';
import { UpdateRemotePostPollUseCase } from '../../../useCase/updateRemotePostPoll.ts';
import { createD1ActorResolverById } from '../../d1/actor/actorResolverById.ts';
import { createD1ActorResolverByUri } from '../../d1/actor/actorResolverByUri.ts';
import { createD1ActorResolverByUserId } from '../../d1/actor/actorResolverByUserId.ts';
import { createD1LogoUriUpdatedStore } from '../../d1/actor/logoUriUpdatedStore.ts';
import { createD1RemoteActorCreatedStore } from '../../d1/actor/remoteActorCreatedStore.ts';
import { createD1RemoteActorProfileUpdatedStore } from '../../d1/actor/remoteActorProfileUpdatedStore.ts';
import { createD1ArticleResolver } from '../../d1/article/articleResolver.ts';
import { createD1BlockedActorUriResolverByUsername } from '../../d1/block/blockedActorUriResolverByUsername.ts';
import { createD1BlockResolver } from '../../d1/block/blockResolver.ts';
import { createD1BookmarkDeletedStore } from '../../d1/bookmark/bookmarkDeletedStore.ts';
import { createD1BookmarksResolverByPostId } from '../../d1/bookmark/bookmarksResolverByPostId.ts';
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
import { createD1FollowedByLocalActorResolverByActorUri } from '../../d1/follow/followedByLocalActorResolverByActorUri.ts';
import { createD1FollowResolver } from '../../d1/follow/followResolver.ts';
import { createD1UndoFollowingProcessedStore } from '../../d1/follow/undoFollowingProcessedStore.ts';
import { createD1PostImageCreatedStore } from '../../d1/image/postImageCreatedStore.ts';
import { createD1PostImagesResolverByPostId } from '../../d1/image/postImagesResolver.ts';
import { createD1LikesResolverByPostId } from '../../d1/like/likesResolverByPostId.ts';
import { createD1LocalLikeDeletedStore } from '../../d1/like/localLikeDeletedStore.ts';
import { createD1RemoteLikeCreatedStore } from '../../d1/like/remoteLikeCreatedStore.ts';
import { createD1RemoteLikeDeletedStore } from '../../d1/like/remoteLikeDeletedStore.ts';
import { createD1RemoteLikeResolverByActivityUri } from '../../d1/like/remoteLikeResolverByActivityUri.ts';
import { createD1LinkPreviewCreatedStore } from '../../d1/linkPreview/linkPreviewCreatedStore.ts';
import { createD1LinkPreviewsDeletedStore } from '../../d1/linkPreview/linkPreviewsDeletedStore.ts';
import { createD1LinkPreviewsResolverByPostId } from '../../d1/linkPreview/linkPreviewsResolverByPostId.ts';
import {
  createD1EmojiReactNotificationCreatedStore,
  createD1EmojiReactNotificationDeletedStore,
  createD1EmojiReactNotificationsResolverByPostId,
  createD1FollowNotificationCreatedStore,
  createD1LikeNotificationCreatedStore,
  createD1LikeNotificationDeletedStore,
  createD1LikeNotificationsResolverByPostId,
  createD1MentionNotificationCreatedStore,
  createD1MentionNotificationDeletedStore,
  createD1MentionNotificationResolverByRecipientAndMentionPostId,
  createD1MentionNotificationsResolverByMentionPostId,
  createD1ReplyNotificationCreatedStore,
  createD1ReplyNotificationDeletedStore,
  createD1ReplyNotificationsResolverByOriginalPostId,
  createD1ReplyNotificationsResolverByReplyPostId,
  createD1RepostNotificationCreatedStore,
  createD1RepostNotificationResolverByRecipientAndActorIdAndPostId,
} from '../../d1/notification/inboxNotificationAdapters.ts';
import { createD1LocalPostResolverByUri } from '../../d1/post/localPostResolverByUri.ts';
import { createD1PostCreatedStore } from '../../d1/post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../../d1/post/postDeletedStore.ts';
import { createD1PostResolver } from '../../d1/post/postResolver.ts';
import { createD1PostResolverByUri } from '../../d1/post/postResolverByUri.ts';
import { createD1RemotePostPollUpdatedStore } from '../../d1/post/remotePostPollUpdatedStore.ts';
import { createD1RemotePostRecipientsResolverByPostId } from '../../d1/post/remotePostRecipientsResolverByPostId.ts';
import { createD1RemotePostUpdatedStore } from '../../d1/post/remotePostUpdatedStore.ts';
import { createD1RemotePostUpserter } from '../../d1/post/remotePostUpserter.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../../d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1AcceptedRelaysResolver } from '../../d1/relay/acceptedRelaysResolver.ts';
import { createD1RelayResolverByActorUri } from '../../d1/relay/relayResolverByActorUri.ts';
import { createD1RelaySubscriptionAcceptedStore } from '../../d1/relay/relaySubscriptionAcceptedStore.ts';
import { createD1RepostCreatedStore } from '../../d1/repost/repostCreatedStore.ts';
import { createD1RepostDeletedStore } from '../../d1/repost/repostDeletedStore.ts';
import { createD1RepostResolver } from '../../d1/repost/repostResolver.ts';
import { createD1RepostResolverByActivityUri } from '../../d1/repost/repostResolverByActivityUri.ts';
import { createD1RepostsResolverByPostId } from '../../d1/repost/repostsResolverByPostId.ts';
import { createD1TimelineItemCreatedStore } from '../../d1/timeline/timelineItemCreatedStore.ts';
import { createD1TimelineItemDeletedStore } from '../../d1/timeline/timelineItemDeletedStore.ts';
import { createD1TimelineItemsResolverByPostId } from '../../d1/timeline/timelineItemsResolverByPostId.ts';
import { createD1UserResolverByUsername } from '../../d1/user/userResolverByUsername.ts';
import { createOgpFetcher } from '../../ogp/ogpFetcher.ts';
import { createCloudflareWebPushSender } from '../../webPush/cloudflareWebPushSender.ts';
import { isBlockedUri } from '../blockedInboxDomain.ts';
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
  const remoteActorProfileUpdatedStore = createD1RemoteActorProfileUpdatedStore(db);
  const postResolver = createD1PostResolver(db);
  const postResolverByUri = createD1PostResolverByUri(db);
  const postCreatedStore = createD1PostCreatedStore(db);
  const localPostResolverByUri = createD1LocalPostResolverByUri(db, origin);
  const remotePostUpserter = createD1RemotePostUpserter({
    postResolverByUri,
    postCreatedStore,
    postImageCreatedStore: createD1PostImageCreatedStore(db),
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    remoteActorProfileUpdatedStore,
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
  const blockResolver = createD1BlockResolver(db);

  const addReceivedEmojiReactUseCase = AddReceivedEmojiReactUseCase.create({
    emojiReactCreatedStore,
    emojiReactResolverByActivityUri,
    emojiReactNotificationCreatedStore,
    postResolver,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    remoteActorProfileUpdatedStore,
    actorResolverByUri,
    pushSubscriptionsResolver,
    webPushSender,
    blockResolver,
  });
  const addReceivedLikeUseCase = AddReceivedLikeUseCase.create({
    remoteLikeCreatedStore: createD1RemoteLikeCreatedStore(db),
    remoteLikeResolverByActivityUri: createD1RemoteLikeResolverByActivityUri(db),
    likeNotificationCreatedStore: createD1LikeNotificationCreatedStore(db),
    postResolver,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    remoteActorProfileUpdatedStore,
    actorResolverByUri,
    pushSubscriptionsResolver,
    webPushSender,
    blockResolver,
  });
  const addReceivedRepostUseCase = AddReceivedRepostUseCase.create({
    repostCreatedStore: createD1RepostCreatedStore(db),
    repostResolverByActivityUri: createD1RepostResolverByActivityUri(db),
    repostResolver: createD1RepostResolver(db),
    repostNotificationCreatedStore: createD1RepostNotificationCreatedStore(db),
    repostNotificationResolver: createD1RepostNotificationResolverByRecipientAndActorIdAndPostId(db),
    postResolver,
    remotePostUpserter,
    remoteActorCreatedStore,
    logoUriUpdatedStore,
    remoteActorProfileUpdatedStore,
    actorResolverByUri,
    timelineItemCreatedStore,
    pushSubscriptionsResolver,
    webPushSender,
    blockResolver,
  });

  return createInboxListener({
    onAccept: {
      origin,
      relayResolverByActorUri: createD1RelayResolverByActorUri(db),
      inboxActorResolver,
      acceptRelaySubscriptionUseCase: AcceptRelaySubscriptionUseCase.create({
        relayResolverByActorUri: createD1RelayResolverByActorUri(db),
        relaySubscriptionAcceptedStore: createD1RelaySubscriptionAcceptedStore(db),
      }),
      actorResolverByUri,
      followResolver: createD1FollowResolver(db),
      followAcceptedStore: createD1FollowAcceptedStore(db),
    },
    onReject: {
      inboxActorResolver,
      actorResolverByUri,
      followResolver: createD1FollowResolver(db),
      undoFollowingProcessedStore: createD1UndoFollowingProcessedStore(db),
    },
    onFollow: {
      inboxActorResolver,
      blockedActorUriResolverByUsername: createD1BlockedActorUriResolverByUsername(db),
      acceptFollowRequestUseCase: AcceptFollowRequestUseCase.create({
        followedStore: createD1FollowAcceptedStore(db),
        followResolver: createD1FollowResolver(db),
        actorResolverByUri,
        actorResolverByUserId,
        remoteActorCreatedStore,
        userResolverByUsername: createD1UserResolverByUsername(db),
        logoUriUpdatedStore,
        remoteActorProfileUpdatedStore,
        followNotificationCreatedStore: createD1FollowNotificationCreatedStore(db),
        pushSubscriptionsResolver,
        webPushSender,
        blockResolver,
      }),
    },
    onBlock: {
      acceptBlockUseCase: AcceptBlockUseCase.create({
        unfollowedStore: createD1UndoFollowingProcessedStore(db),
        followResolver: createD1FollowResolver(db),
        actorResolverByUri,
        actorResolverByUserId,
        userResolverByUsername: createD1UserResolverByUsername(db),
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
        actorResolverById: createD1ActorResolverById(db),
        remoteLikeDeletedStore: createD1RemoteLikeDeletedStore(db),
        remoteLikeResolverByActivityUri: createD1RemoteLikeResolverByActivityUri(db),
      }),
      removeReceivedRepostUseCase: RemoveReceivedRepostUseCase.create({
        repostDeletedStore: createD1RepostDeletedStore(db),
        repostResolverByActivityUri: createD1RepostResolverByActivityUri(db),
      }),
      removeReceivedEmojiReactUseCase: RemoveReceivedEmojiReactUseCase.create({
        actorResolverById: createD1ActorResolverById(db),
        emojiReactDeletedStore: createD1EmojiReactDeletedStore(db),
        emojiReactResolverByActivityUri,
      }),
    },
    onCreate: {
      origin,
      inboxActorResolver,
      followedByLocalActorResolverByActorUri: createD1FollowedByLocalActorResolverByActorUri(db),
      acceptedRelaysResolver: createD1AcceptedRelaysResolver(db),
      remotePostUpserter,
      actorResolverByUri,
      federatedTimelineItemResolverByPostId: createD1FederatedTimelineItemResolverByPostId(db),
      federatedTimelineItemCreatedStore: createD1FederatedTimelineItemCreatedStore(db),
      addRemotePostUseCase: AddRemotePostUseCase.create({
        origin,
        postCreatedStore,
        postResolverByUri,
        postImageCreatedStore: createD1PostImageCreatedStore(db),
        postImagesResolver: createD1PostImagesResolverByPostId(db),
        remoteActorCreatedStore,
        logoUriUpdatedStore,
        remoteActorProfileUpdatedStore,
        actorResolverByUri,
        timelineItemCreatedStore,
        timelineItemsResolverByPostId: createD1TimelineItemsResolverByPostId(db),
        localPostResolverByUri,
        replyNotificationCreatedStore: createD1ReplyNotificationCreatedStore(db),
        replyNotificationsResolverByReplyPostId: createD1ReplyNotificationsResolverByReplyPostId(db),
        mentionNotificationCreatedStore: createD1MentionNotificationCreatedStore(db),
        mentionNotificationResolver: createD1MentionNotificationResolverByRecipientAndMentionPostId(db),
        pushSubscriptionsResolver,
        webPushSender,
        blockResolver,
        linkPreviewCreatedStore: createD1LinkPreviewCreatedStore(db),
        linkPreviewsResolver: createD1LinkPreviewsResolverByPostId(db),
        ogpFetcher: createOgpFetcher(),
      }),
      fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase.create({
        origin,
        postResolverByUri,
        localPostResolverByUri,
        remotePostUpserter,
        isBlockedUri: (uri) => isBlockedUri(uri),
      }),
    },
    onDelete: {
      remotePostResolverByUri: postResolverByUri,
      actorResolverById: createD1ActorResolverById(db),
      timelineItemsResolverByPostId: createD1TimelineItemsResolverByPostId(db),
      likeNotificationsResolverByPostId: createD1LikeNotificationsResolverByPostId(db),
      emojiReactNotificationsResolverByPostId: createD1EmojiReactNotificationsResolverByPostId(db),
      replyNotificationsResolverByReplyPostId: createD1ReplyNotificationsResolverByReplyPostId(db),
      replyNotificationsResolverByOriginalPostId: createD1ReplyNotificationsResolverByOriginalPostId(db),
      mentionNotificationsResolverByMentionPostId: createD1MentionNotificationsResolverByMentionPostId(db),
      repostsResolverByPostId: createD1RepostsResolverByPostId(db),
      likesResolverByPostId: createD1LikesResolverByPostId(db),
      emojiReactsResolverByPostId: createD1EmojiReactsResolverByPostId(db),
      bookmarksResolverByPostId: createD1BookmarksResolverByPostId(db),
      federatedTimelineItemsResolverByPostId: createD1FederatedTimelineItemsResolverByPostId(db),
      timelineItemDeletedStore: createD1TimelineItemDeletedStore(db),
      likeNotificationDeletedStore: createD1LikeNotificationDeletedStore(db),
      emojiReactNotificationDeletedStore: createD1EmojiReactNotificationDeletedStore(db),
      replyNotificationDeletedStore: createD1ReplyNotificationDeletedStore(db),
      mentionNotificationDeletedStore: createD1MentionNotificationDeletedStore(db),
      repostDeletedStore: createD1RepostDeletedStore(db),
      localLikeDeletedStore: createD1LocalLikeDeletedStore(db),
      remoteLikeDeletedStore: createD1RemoteLikeDeletedStore(db),
      emojiReactDeletedStore: createD1EmojiReactDeletedStore(db),
      bookmarkDeletedStore: createD1BookmarkDeletedStore(db),
      federatedTimelineItemDeletedStore: createD1FederatedTimelineItemDeletedStore(db),
      postDeletedStore: createD1PostDeletedStore(db),
    },
    onUpdate: {
      origin,
      updateRemotePostUseCase: UpdateRemotePostUseCase.create({
        origin,
        postResolverByUri,
        actorResolverByUri,
        remotePostRecipientsResolver: createD1RemotePostRecipientsResolverByPostId(db),
        postImagesResolver: createD1PostImagesResolverByPostId(db),
        remotePostUpdatedStore: createD1RemotePostUpdatedStore(db),
        linkPreviewsResolver: createD1LinkPreviewsResolverByPostId(db),
        linkPreviewCreatedStore: createD1LinkPreviewCreatedStore(db),
        linkPreviewsDeletedStore: createD1LinkPreviewsDeletedStore(db),
        ogpFetcher: createOgpFetcher(),
        localPostResolverByUri,
        mentionNotificationCreatedStore: createD1MentionNotificationCreatedStore(db),
        mentionNotificationResolver: createD1MentionNotificationResolverByRecipientAndMentionPostId(db),
        pushSubscriptionsResolver,
        webPushSender,
        blockResolver,
      }),
      updateRemotePostPollUseCase: UpdateRemotePostPollUseCase.create({
        postResolverByUri,
        actorResolverByUri,
        remotePostPollUpdatedStore: createD1RemotePostPollUpdatedStore(db),
      }),
    },
    onLike: { inboxActorResolver, addReceivedEmojiReactUseCase, addReceivedLikeUseCase },
    onAnnounce: {
      origin,
      relayResolverByActorUri: createD1RelayResolverByActorUri(db),
      followedByLocalActorResolverByActorUri: createD1FollowedByLocalActorResolverByActorUri(db),
      acceptedRelaysResolver: createD1AcceptedRelaysResolver(db),
      inboxActorResolver,
      addReceivedRepostUseCase,
      remotePostUpserter,
      actorResolverByUri,
      articleResolver: createD1ArticleResolver(db),
      federatedTimelineItemResolverByPostId: createD1FederatedTimelineItemResolverByPostId(db),
      federatedTimelineItemCreatedStore: createD1FederatedTimelineItemCreatedStore(db),
    },
    onActivity: { inboxActorResolver, addReceivedEmojiReactUseCase },
  });
};
