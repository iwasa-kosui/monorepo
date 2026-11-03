import { ArticleId } from '../../../domain/article/articleId.ts';
import { type DigestHeader, DigestTrigger } from '../../../domain/digest/digest.ts';
import { DigestId } from '../../../domain/digest/digestId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { digestsTable } from '../schema.ts';

export const reconstructDigestHeader = (row: typeof digestsTable.$inferSelect): DigestHeader => ({
  digestId: DigestId.orThrow(row.digestId),
  userId: UserId.orThrow(row.userId),
  digestDate: row.digestDate,
  articleId: ArticleId.orThrow(row.articleId),
  createdAt: Instant.orThrow(row.createdAt.getTime()),
  pushSentAt: row.pushSentAt === null ? null : Instant.orThrow(row.pushSentAt.getTime()),
  trigger: DigestTrigger.zodType.parse(row.trigger),
});
