import type { Delete, InboxContext } from "@fedify/fedify";
import { getLogger } from "@logtape/logtape";
import { eq } from "drizzle-orm";
import { Instant } from "../../../domain/instant/instant.ts";
import { Post } from "../../../domain/post/post.ts";
import { PostId } from "../../../domain/post/postId.ts";
import { DB } from "../../pg/db.ts";
import { PgPostDeletedStore } from "../../pg/post/postDeletedStore.ts";
import { remotePostsTable } from "../../pg/schema.ts";

export const onDelete = async (
  ctx: InboxContext<unknown>,
  del: Delete,
): Promise<void> => {
  const logger = getLogger();

  const objectId = del.objectId;
  if (!objectId) {
    logger.warn("Delete activity has no object ID");
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

  // Delete the post via event store
  const postId = PostId.parseOrThrow(remotePost.postId);
  const deleteEvent = Post.deletePost(Instant.now())(postId);
  const postDeletedStore = PgPostDeletedStore.getInstance();
  await postDeletedStore.store(deleteEvent);

  logger.info(`Deleted remote post: ${remotePost.postId}`);
};
