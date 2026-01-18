import type { Delete, InboxContext } from '@fedify/fedify';
import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import { Notification } from '../../../domain/notification/notification.ts';
import { Post } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { Repost } from '../../../domain/repost/repost.ts';
import { TimelineItem } from '../../../domain/timeline/timelineItem.ts';
import { DB } from '../../pg/db.ts';
import { PgLikeNotificationDeletedStore } from '../../pg/notification/likeNotificationDeletedStore.ts';
import { PgLikeNotificationsResolverByPostId } from '../../pg/notification/likeNotificationsResolverByPostId.ts';
import { PgPostDeletedStore } from '../../pg/post/postDeletedStore.ts';
import { PgRepostDeletedStore } from '../../pg/repost/repostDeletedStore.ts';
import { PgRepostsResolverByOriginalPostId } from '../../pg/repost/repostsResolverByOriginalPostId.ts';
import { remotePostsTable } from '../../pg/schema.ts';
import { PgTimelineItemDeletedStore } from '../../pg/timeline/timelineItemDeletedStore.ts';
import { PgTimelineItemsResolverByPostId } from '../../pg/timeline/timelineItemsResolverByPostId.ts';

export const onDelete = async (
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
  const db = DB.getInstance();
  const [remotePost] = await db
    .select({ postId: remotePostsTable.postId })
    .from(remotePostsTable)
    .where(eq(remotePostsTable.uri, objectUri))
    .limit(1);

  if (!remotePost) {
    logger.info(`No remote post found for URI: ${objectUri}`);
    return;
  }

  const postId = PostId.parseOrThrow(remotePost.postId);
  const now = Instant.now();

  // Resolve all related entities in parallel
  const [timelineItemsResult, notificationsResult, repostsResult] = await Promise.all([
    PgTimelineItemsResolverByPostId.getInstance().resolve({ postId }),
    PgLikeNotificationsResolverByPostId.getInstance().resolve({ postId }),
    PgRepostsResolverByOriginalPostId.getInstance().resolve({ originalPostId: postId }),
  ]);

  // Generate all delete events
  const timelineItemEvents = timelineItemsResult.ok
    ? timelineItemsResult.val.map((item) => TimelineItem.deleteTimelineItem(item.timelineItemId, now))
    : [];

  const notificationEvents = notificationsResult.ok
    ? notificationsResult.val.map((n) => Notification.deleteLikeNotification(n, now))
    : [];

  const repostEvents = repostsResult.ok
    ? repostsResult.val.map((r) => Repost.deleteRepost(r, now))
    : [];

  // Store all events in batch (each store handles its own transaction)
  await Promise.all([
    PgTimelineItemDeletedStore.getInstance().store(...timelineItemEvents),
    PgLikeNotificationDeletedStore.getInstance().store(...notificationEvents),
    PgRepostDeletedStore.getInstance().store(...repostEvents),
  ]);

  // Delete the post via event store
  const deleteEvent = Post.deletePost(now)(postId);
  await PgPostDeletedStore.getInstance().store(deleteEvent);

  logger.info(`Deleted remote post: ${remotePost.postId}`);
};
