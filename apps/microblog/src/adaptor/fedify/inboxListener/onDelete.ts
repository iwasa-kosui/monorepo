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
import { PgLikeNotificationsDeletedByPostIdStore } from '../../pg/notification/likeNotificationsDeletedByPostIdStore.ts';
import { PgPostDeletedStore } from '../../pg/post/postDeletedStore.ts';
import { PgRepostsOriginalPostUnlinkedStore } from '../../pg/repost/repostsOriginalPostUnlinkedStore.ts';
import { remotePostsTable } from '../../pg/schema.ts';
import { PgTimelineItemsDeletedByPostIdStore } from '../../pg/timeline/timelineItemsDeletedByPostIdStore.ts';

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

  // Delete related data from other aggregates
  const timelineItemsDeletedEvent = TimelineItem.deleteTimelineItemsByPostId(postId, now);
  await PgTimelineItemsDeletedByPostIdStore.getInstance().store(timelineItemsDeletedEvent);

  const notificationsDeletedEvent = Notification.deleteLikeNotificationsByPostId(postId, now);
  await PgLikeNotificationsDeletedByPostIdStore.getInstance().store(notificationsDeletedEvent);

  const repostsUnlinkedEvent = Repost.unlinkOriginalPost(postId, now);
  await PgRepostsOriginalPostUnlinkedStore.getInstance().store(repostsUnlinkedEvent);

  // Delete the post via event store
  const deleteEvent = Post.deletePost(now)(postId);
  await PgPostDeletedStore.getInstance().store(deleteEvent);

  logger.info(`Deleted remote post: ${remotePost.postId}`);
};
