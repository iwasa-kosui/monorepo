import type { Delete, InboxContext } from '@fedify/fedify';
import { getLogger } from '@logtape/logtape';

import {
  EmojiReact,
  type EmojiReactDeletedStore,
  type EmojiReactsResolverByPostId,
} from '../../../domain/emojiReact/emojiReact.ts';
import {
  FederatedTimelineItem,
  type FederatedTimelineItemDeletedStore,
  type FederatedTimelineItemsResolverByPostId,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import {
  Like,
  type LikesResolverByPostId,
  type LocalLikeDeletedStore,
  type RemoteLikeDeletedStore,
} from '../../../domain/like/like.ts';
import type {
  EmojiReactNotificationDeletedStore,
  EmojiReactNotificationsResolverByPostId,
  LikeNotificationDeletedStore,
  LikeNotificationsResolverByPostId,
  ReplyNotificationDeletedStore,
  ReplyNotificationsResolverByOriginalPostId,
  ReplyNotificationsResolverByReplyPostId,
} from '../../../domain/notification/notification.ts';
import { Notification } from '../../../domain/notification/notification.ts';
import { Post, type PostDeletedStore, type PostResolverByUri } from '../../../domain/post/post.ts';
import { Repost, type RepostDeletedStore, type RepostsResolverByPostId } from '../../../domain/repost/repost.ts';
import {
  TimelineItem,
  type TimelineItemDeletedStore,
  type TimelineItemsResolverByPostId,
} from '../../../domain/timeline/timelineItem.ts';

export type OnDeleteDeps = Readonly<{
  remotePostResolverByUri: PostResolverByUri;
  timelineItemsResolverByPostId: TimelineItemsResolverByPostId;
  likeNotificationsResolverByPostId: LikeNotificationsResolverByPostId;
  emojiReactNotificationsResolverByPostId: EmojiReactNotificationsResolverByPostId;
  replyNotificationsResolverByReplyPostId: ReplyNotificationsResolverByReplyPostId;
  replyNotificationsResolverByOriginalPostId: ReplyNotificationsResolverByOriginalPostId;
  repostsResolverByPostId: RepostsResolverByPostId;
  likesResolverByPostId: LikesResolverByPostId;
  emojiReactsResolverByPostId: EmojiReactsResolverByPostId;
  federatedTimelineItemsResolverByPostId: FederatedTimelineItemsResolverByPostId;
  timelineItemDeletedStore: TimelineItemDeletedStore;
  likeNotificationDeletedStore: LikeNotificationDeletedStore;
  emojiReactNotificationDeletedStore: EmojiReactNotificationDeletedStore;
  replyNotificationDeletedStore: ReplyNotificationDeletedStore;
  repostDeletedStore: RepostDeletedStore;
  localLikeDeletedStore: LocalLikeDeletedStore;
  remoteLikeDeletedStore: RemoteLikeDeletedStore;
  emojiReactDeletedStore: EmojiReactDeletedStore;
  federatedTimelineItemDeletedStore: FederatedTimelineItemDeletedStore;
  postDeletedStore: PostDeletedStore;
}>;

export const createOnDelete = (deps: OnDeleteDeps) =>
async (
  ctx: InboxContext<unknown>,
  del: Delete,
): Promise<void> => {
  const logger = getLogger();

  const objectId = del.objectId;
  if (!objectId) {
    logger.warn('Delete activity has no object ID');
    return;
  }

  const objectUri = objectId.href;
  logger.info(`Received Delete activity for: ${objectUri}`);

  // Find the remote post
  const remotePostResult = await deps.remotePostResolverByUri.resolve({ uri: objectUri });
  const remotePost = remotePostResult.ok ? remotePostResult.val : undefined;

  if (!remotePost) {
    logger.info(`No remote post found for URI: ${objectUri}`);
    return;
  }

  const postId = remotePost.postId;
  const now = Instant.now();

  // Resolve all related entities in parallel
  const [
    timelineItemsResult,
    likeNotificationsResult,
    emojiReactNotificationsResult,
    replyNotificationsByReplyPostResult,
    replyNotificationsByOriginalPostResult,
    repostsResult,
    likesResult,
    emojiReactsResult,
    federatedTimelineItemsResult,
  ] = await Promise.all([
    deps.timelineItemsResolverByPostId.resolve({ postId }),
    deps.likeNotificationsResolverByPostId.resolve({ postId }),
    deps.emojiReactNotificationsResolverByPostId.resolve({ postId }),
    deps.replyNotificationsResolverByReplyPostId.resolve({ replyPostId: postId }),
    deps.replyNotificationsResolverByOriginalPostId.resolve({ originalPostId: postId }),
    deps.repostsResolverByPostId.resolve({ postId }),
    deps.likesResolverByPostId.resolve({ postId }),
    deps.emojiReactsResolverByPostId.resolve({ postId }),
    deps.federatedTimelineItemsResolverByPostId.resolve({ postId }),
  ]);

  // Generate all delete events
  const timelineItemEvents = timelineItemsResult.ok
    ? timelineItemsResult.val.map((item) => TimelineItem.deleteTimelineItem(item.timelineItemId, now))
    : [];

  const likeNotificationEvents = likeNotificationsResult.ok
    ? likeNotificationsResult.val.map((n) => Notification.deleteLikeNotification(n, now))
    : [];

  const emojiReactNotificationEvents = emojiReactNotificationsResult.ok
    ? emojiReactNotificationsResult.val.map((n) => Notification.deleteEmojiReactNotification(n, now))
    : [];

  const replyNotificationEvents = [
    ...(replyNotificationsByReplyPostResult.ok
      ? replyNotificationsByReplyPostResult.val.map((n) => Notification.deleteReplyNotification(n, now))
      : []),
    ...(replyNotificationsByOriginalPostResult.ok
      ? replyNotificationsByOriginalPostResult.val.map((n) => Notification.deleteReplyNotification(n, now))
      : []),
  ];

  const repostEvents = repostsResult.ok
    ? repostsResult.val.map((r) => Repost.deleteRepost(r, now))
    : [];

  const localLikeEvents = likesResult.ok
    ? likesResult.val.filter((like) => like.type === 'local').map((like) => Like.deleteLocalLike(like, now))
    : [];
  const remoteLikeEvents = likesResult.ok
    ? likesResult.val.filter((like) => like.type === 'remote').map((like) => Like.deleteRemoteLike(like, now))
    : [];
  const emojiReactEvents = emojiReactsResult.ok
    ? emojiReactsResult.val.map((reaction) => EmojiReact.deleteEmojiReact(reaction, now))
    : [];
  const federatedTimelineItemEvents = federatedTimelineItemsResult.ok
    ? federatedTimelineItemsResult.val.map((item) =>
      FederatedTimelineItem.deleteFederatedTimelineItem(item.federatedTimelineItemId, now)
    )
    : [];

  // Store all events in batch (each store handles its own transaction)
  await Promise.all([
    deps.timelineItemDeletedStore.store(...timelineItemEvents),
    deps.likeNotificationDeletedStore.store(...likeNotificationEvents),
    deps.emojiReactNotificationDeletedStore.store(...emojiReactNotificationEvents),
    deps.replyNotificationDeletedStore.store(...replyNotificationEvents),
    deps.repostDeletedStore.store(...repostEvents),
    deps.localLikeDeletedStore.store(...localLikeEvents),
    deps.remoteLikeDeletedStore.store(...remoteLikeEvents),
    deps.emojiReactDeletedStore.store(...emojiReactEvents),
    deps.federatedTimelineItemDeletedStore.store(...federatedTimelineItemEvents),
  ]);

  // Delete the post via event store
  const deleteEvent = Post.deletePost(now)(postId);
  await deps.postDeletedStore.store(deleteEvent);

  logger.info(`Deleted remote post: ${remotePost.postId}`);
};
