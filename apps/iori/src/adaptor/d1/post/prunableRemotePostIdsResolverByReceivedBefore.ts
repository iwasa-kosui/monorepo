import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import { PostId } from '../../../domain/post/postId.ts';
import type { PrunableRemotePostIdsResolverByReceivedBefore } from '../../../domain/post/remotePostPruning.ts';
import type { IoriD1Db } from '../client.ts';

export const createD1PrunableRemotePostIdsResolverByReceivedBefore = (
  db: IoriD1Db,
): PrunableRemotePostIdsResolverByReceivedBefore => ({
  resolve: async ({ receivedBefore, limit }) => {
    const rows = await db.all<{ postId: string }>(sql`
      WITH received AS (
        SELECT postId, MAX(receivedAt) AS lastReceivedAt
        FROM federated_timeline_items
        WHERE receivedAt < ${receivedBefore}
        GROUP BY postId
      )
      SELECT p.postId AS postId
      FROM received
      JOIN posts p ON p.postId = received.postId
      JOIN remote_posts rp ON rp.postId = p.postId
      WHERE p.type = 'remote'
        AND NOT EXISTS (
          SELECT 1 FROM federated_timeline_items newer
          WHERE newer.postId = p.postId AND newer.receivedAt >= ${receivedBefore}
        )
        AND p.postId NOT IN (SELECT postId FROM likes WHERE type = 'local')
        AND p.postId NOT IN (
          SELECT postId FROM emoji_reacts WHERE actorId IN (SELECT actorId FROM local_actors)
        )
        AND p.postId NOT IN (SELECT postId FROM timeline_items WHERE deletedAt IS NULL)
        AND p.postId NOT IN (
          SELECT postId FROM reposts WHERE actorId IN (SELECT actorId FROM local_actors)
        )
        AND p.postId NOT IN (SELECT postId FROM bookmarks)
        AND p.postId NOT IN (SELECT likedPostId FROM notification_likes)
        AND p.postId NOT IN (SELECT repostedPostId FROM notification_reposts)
        AND p.postId NOT IN (SELECT reactedPostId FROM notification_emoji_reacts)
        AND p.postId NOT IN (SELECT replyPostId FROM notification_replies)
        AND p.postId NOT IN (SELECT originalPostId FROM notification_replies)
        AND p.postId NOT IN (SELECT mentionPostId FROM notification_mentions)
        AND p.postId NOT IN (SELECT rootPostId FROM articles WHERE rootPostId IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM local_posts reply WHERE reply.inReplyToUri = rp.uri)
        AND NOT EXISTS (
          SELECT 1 FROM local_posts parent
          WHERE rp.inReplyToUri IS NOT NULL
            AND parent.postId = replace(rp.inReplyToUri, rtrim(rp.inReplyToUri, replace(rp.inReplyToUri, '/', '')), '')
            AND rp.inReplyToUri LIKE '%/posts/' || parent.postId
        )
      ORDER BY received.lastReceivedAt ASC, p.postId ASC
      LIMIT ${limit}
    `);
    return RA.ok(rows.map((row) => PostId.orThrow(row.postId)));
  },
});
