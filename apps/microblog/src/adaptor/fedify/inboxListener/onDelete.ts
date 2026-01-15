import { getLogger } from "@logtape/logtape";
import type { Delete, InboxContext } from "@fedify/fedify";
import { DB } from "../../pg/db.ts";
import { postsTable, remotePostsTable } from "../../pg/schema.ts";
import { eq } from "drizzle-orm";

export const onDelete = async (
  ctx: InboxContext<unknown>,
  del: Delete
): Promise<void> => {
  const logger = getLogger();

  const objectId = del.objectId;
  if (!objectId) {
    logger.warn("Delete activity has no object ID");
    return;
  }

  const objectUri = objectId.href;
  logger.info(`Received Delete activity for: ${objectUri}`);

  // Find and soft delete the remote post
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

  await db
    .update(postsTable)
    .set({ deletedAt: new Date() })
    .where(eq(postsTable.postId, remotePost.postId));

  logger.info(`Soft deleted remote post: ${remotePost.postId}`);
};
