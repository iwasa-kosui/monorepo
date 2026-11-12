import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNotNull, notInArray } from 'drizzle-orm';

import type { RemotePostsPrunedStore } from '../../../domain/post/remotePostPruning.ts';
import type { IoriD1Db } from '../client.ts';
import { runBatch } from '../runBatch.ts';
import {
  directPostParticipantsTable,
  emojiReactsTable,
  federatedTimelineItemsTable,
  likesTable,
  localActorsTable,
  postImagesTable,
  postQuotesTable,
  postsTable,
  remoteLikesTable,
  remotePostRecipientsTable,
  remotePostsTable,
  repostsTable,
  timelineItemsTable,
} from '../schema.ts';

export const createD1RemotePostsPrunedStore = (db: IoriD1Db): RemotePostsPrunedStore => ({
  store: async (postIds) => {
    if (postIds.length === 0) return RA.ok(undefined);
    const ids = [...postIds];
    const localActorIds = db.select({ actorId: localActorsTable.actorId }).from(localActorsTable);
    const remoteLikeIds = db.select({ likeId: likesTable.likeId }).from(likesTable)
      .where(and(inArray(likesTable.postId, ids), eq(likesTable.type, 'remote')));
    await runBatch(db, [
      db.delete(federatedTimelineItemsTable).where(inArray(federatedTimelineItemsTable.postId, ids)),
      db.delete(timelineItemsTable).where(
        and(inArray(timelineItemsTable.postId, ids), isNotNull(timelineItemsTable.deletedAt)),
      ),
      db.delete(remoteLikesTable).where(inArray(remoteLikesTable.likeId, remoteLikeIds)),
      db.delete(likesTable).where(and(inArray(likesTable.postId, ids), eq(likesTable.type, 'remote'))),
      db.delete(emojiReactsTable).where(
        and(inArray(emojiReactsTable.postId, ids), notInArray(emojiReactsTable.actorId, localActorIds)),
      ),
      db.delete(repostsTable).where(
        and(inArray(repostsTable.postId, ids), notInArray(repostsTable.actorId, localActorIds)),
      ),
      db.delete(postImagesTable).where(inArray(postImagesTable.postId, ids)),
      db.delete(postQuotesTable).where(inArray(postQuotesTable.postId, ids)),
      db.delete(directPostParticipantsTable).where(inArray(directPostParticipantsTable.postId, ids)),
      db.delete(remotePostRecipientsTable).where(inArray(remotePostRecipientsTable.postId, ids)),
      db.delete(remotePostsTable).where(inArray(remotePostsTable.postId, ids)),
      db.delete(postsTable).where(inArray(postsTable.postId, ids)),
    ]);
    return RA.ok(undefined);
  },
});
