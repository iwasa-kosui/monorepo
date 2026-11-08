import { RA } from '@iwasa-kosui/result';
import { asc, eq } from 'drizzle-orm';

import type { DigestTopicsResolverByUserId } from '../../../domain/digestTopic/digestTopic.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { digestTopicsTable } from '../schema.ts';

export const createD1DigestTopicsResolverByUserId = (db: IoriD1Db): DigestTopicsResolverByUserId => ({
  resolve: async (userId) => {
    const rows = await db.select().from(digestTopicsTable)
      .where(eq(digestTopicsTable.userId, userId))
      .orderBy(asc(digestTopicsTable.sortOrder), asc(digestTopicsTable.topicKey));
    return RA.ok(rows.map((row) => ({
      userId: UserId.orThrow(row.userId),
      topicKey: row.topicKey,
      name: row.name,
      description: row.description,
      examples: JSON.parse(row.examples) as string[],
      excludes: JSON.parse(row.excludes) as string[],
      embedding: row.embedding,
      excludeEmbedding: row.excludeEmbedding,
      embeddedAt: row.embeddedAt === null ? null : Instant.orThrow(row.embeddedAt.getTime()),
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      materialWindowHours: row.materialWindowHours,
      createdAt: Instant.orThrow(row.createdAt.getTime()),
      updatedAt: Instant.orThrow(row.updatedAt.getTime()),
    })));
  },
});
