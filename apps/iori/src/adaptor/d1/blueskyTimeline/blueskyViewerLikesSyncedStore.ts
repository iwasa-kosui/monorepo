import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';

import type { BlueskyViewerLikesSyncedStore } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyLikesTable } from '../schema.ts';

const UPSERT_CHUNK_SIZE = 30;

export const createD1BlueskyViewerLikesSyncedStore = (db: IoriD1Db): BlueskyViewerLikesSyncedStore => ({
  sync: async (likes) => {
    if (likes.length === 0) return RA.ok(undefined);
    const stored = await db.select({ subjectUri: blueskyLikesTable.subjectUri, likeUri: blueskyLikesTable.likeUri })
      .from(blueskyLikesTable)
      .where(
        inArray(
          blueskyLikesTable.subjectUri,
          sql`(select value from json_each(${idsJson(likes.map((like) => like.subjectUri))}))`,
        ),
      );
    const storedLikeUris = new Map(stored.map((row) => [row.subjectUri, row.likeUri]));
    const changed = likes.filter((like) => storedLikeUris.get(like.subjectUri) !== like.likeUri);
    for (let start = 0; start < changed.length; start += UPSERT_CHUNK_SIZE) {
      await db.insert(blueskyLikesTable)
        .values(
          changed.slice(start, start + UPSERT_CHUNK_SIZE).map((like) => ({
            subjectUri: like.subjectUri,
            likeUri: like.likeUri,
            createdAt: new Date(like.createdAt),
          })),
        )
        .onConflictDoUpdate({ target: blueskyLikesTable.subjectUri, set: { likeUri: sql`excluded.likeUri` } });
    }
    return RA.ok(undefined);
  },
});
