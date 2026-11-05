import { RA } from '@iwasa-kosui/result';
import { asc, eq } from 'drizzle-orm';

import { ArticleId } from '../../../domain/article/articleId.ts';
import { DigestItemId } from '../../../domain/digest/digestItemId.ts';
import type { DigestDeepDiveResolverByDigestItemId } from '../../../domain/digestDeepDive/digestDeepDive.ts';
import { DigestDeepDiveId, DigestDeepDiveTurnId } from '../../../domain/digestDeepDive/digestDeepDiveId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { digestDeepDivesTable, digestDeepDiveTurnsTable } from '../schema.ts';

export const createD1DigestDeepDiveResolverByDigestItemId = (db: IoriD1Db): DigestDeepDiveResolverByDigestItemId => ({
  resolve: async (digestItemId) => {
    const [row] = await db.select().from(digestDeepDivesTable)
      .where(eq(digestDeepDivesTable.digestItemId, digestItemId))
      .limit(1);
    if (row === undefined) return RA.ok(undefined);
    const turns = await db.select().from(digestDeepDiveTurnsTable)
      .where(eq(digestDeepDiveTurnsTable.deepDiveId, row.deepDiveId))
      .orderBy(asc(digestDeepDiveTurnsTable.turnNumber));
    return RA.ok({
      deepDiveId: DigestDeepDiveId.orThrow(row.deepDiveId),
      userId: UserId.orThrow(row.userId),
      digestItemId: DigestItemId.orThrow(row.digestItemId),
      articleId: ArticleId.orThrow(row.articleId),
      turns: turns.map((turn) => ({
        turnId: DigestDeepDiveTurnId.orThrow(turn.turnId),
        turnNumber: turn.turnNumber,
        instruction: turn.instruction,
        resultMarkdown: turn.resultMarkdown,
        createdAt: Instant.orThrow(turn.createdAt.getTime()),
      })),
      createdAt: Instant.orThrow(row.createdAt.getTime()),
      updatedAt: Instant.orThrow(row.updatedAt.getTime()),
    });
  },
});
