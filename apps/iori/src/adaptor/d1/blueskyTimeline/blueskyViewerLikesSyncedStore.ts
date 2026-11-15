import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { BlueskyViewerLikesSyncedStore } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyLikesTable } from '../schema.ts';

// D1 のバインド数の上限（100）に収まるよう、1 行 4 列で 24 行ずつ入れる
const UPSERT_CHUNK_SIZE = 24;

export const createD1BlueskyViewerLikesSyncedStore = (db: IoriD1Db, userId: UserId): BlueskyViewerLikesSyncedStore => ({
  sync: async (likes) => {
    if (likes.length === 0) return RA.ok(undefined);
    const stored = await db.select({ subjectUri: blueskyLikesTable.subjectUri, likeUri: blueskyLikesTable.likeUri })
      .from(blueskyLikesTable)
      .where(and(
        eq(blueskyLikesTable.userId, userId),
        inArray(
          blueskyLikesTable.subjectUri,
          sql`(select value from json_each(${idsJson(likes.map((like) => like.subjectUri))}))`,
        ),
      ));
    const storedLikeUris = new Map(stored.map((row) => [row.subjectUri, row.likeUri]));
    const changed = likes.filter((like) => storedLikeUris.get(like.subjectUri) !== like.likeUri);
    for (let start = 0; start < changed.length; start += UPSERT_CHUNK_SIZE) {
      await db.insert(blueskyLikesTable)
        .values(
          changed.slice(start, start + UPSERT_CHUNK_SIZE).map((like) => ({
            userId,
            subjectUri: like.subjectUri,
            likeUri: like.likeUri,
            createdAt: new Date(like.createdAt),
          })),
        )
        .onConflictDoUpdate({
          target: [blueskyLikesTable.userId, blueskyLikesTable.subjectUri],
          set: { likeUri: sql`excluded.likeUri` },
        });
    }
    return RA.ok(undefined);
  },
});
