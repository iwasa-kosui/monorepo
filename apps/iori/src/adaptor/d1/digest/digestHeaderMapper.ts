import { type DigestHeader, DigestTrigger } from '../../../domain/digest/digest.ts';
import { DigestId } from '../../../domain/digest/digestId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { digestsTable } from '../schema.ts';

export const reconstructDigestHeader = (row: typeof digestsTable.$inferSelect): DigestHeader => {
  if (row.postId === null) throw new Error(`digest ${row.digestId} has no postId`);
  return {
    digestId: DigestId.orThrow(row.digestId),
    userId: UserId.orThrow(row.userId),
    digestDate: row.digestDate,
    postId: PostId.orThrow(row.postId),
    xPostsPostId: row.xPostsPostId === null ? null : PostId.orThrow(row.xPostsPostId),
    createdAt: Instant.orThrow(row.createdAt.getTime()),
    trigger: DigestTrigger.zodType.parse(row.trigger),
    topicKey: row.topicKey,
  };
};
