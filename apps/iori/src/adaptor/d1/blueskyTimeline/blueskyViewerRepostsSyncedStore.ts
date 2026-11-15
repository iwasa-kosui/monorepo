import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import type { BlueskyViewerRepostsSyncedStore } from '../../../domain/blueskyTimeline/blueskyRepost.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyRepostsTable } from '../schema.ts';

// D1 のバインド数の上限（100）に収まるよう、1 行 4 列で 24 行ずつ入れる
const UPSERT_CHUNK_SIZE = 24;

export const createD1BlueskyViewerRepostsSyncedStore = (db: IoriD1Db, userId: UserId): BlueskyViewerRepostsSyncedStore => ({
  sync: async (reposts) => {
    if (reposts.length === 0) return RA.ok(undefined);
    const stored = await db.select({
      subjectUri: blueskyRepostsTable.subjectUri,
      repostUri: blueskyRepostsTable.repostUri,
    })
      .from(blueskyRepostsTable)
      .where(and(
        eq(blueskyRepostsTable.userId, userId),
        inArray(
          blueskyRepostsTable.subjectUri,
          sql`(select value from json_each(${idsJson(reposts.map((repost) => repost.subjectUri))}))`,
        ),
      ));
    const storedRepostUris = new Map(stored.map((row) => [row.subjectUri, row.repostUri]));
    const changed = reposts.filter((repost) => storedRepostUris.get(repost.subjectUri) !== repost.repostUri);
    for (let start = 0; start < changed.length; start += UPSERT_CHUNK_SIZE) {
      await db.insert(blueskyRepostsTable)
        .values(
          changed.slice(start, start + UPSERT_CHUNK_SIZE).map((repost) => ({
            userId,
            subjectUri: repost.subjectUri,
            repostUri: repost.repostUri,
            createdAt: new Date(repost.createdAt),
          })),
        )
        .onConflictDoUpdate({ target: [blueskyRepostsTable.userId, blueskyRepostsTable.subjectUri], set: { repostUri: sql`excluded.repostUri` } });
    }
    return RA.ok(undefined);
  },
  deleteStale: async (subjectUris, createdBefore) => {
    if (subjectUris.length === 0) return RA.ok(undefined);
    const condition = and(
      eq(blueskyRepostsTable.userId, userId),
      inArray(blueskyRepostsTable.subjectUri, sql`(select value from json_each(${idsJson(subjectUris)}))`),
      lt(blueskyRepostsTable.createdAt, new Date(createdBefore)),
    );
    const stale = await db.select({ subjectUri: blueskyRepostsTable.subjectUri }).from(blueskyRepostsTable).where(
      condition,
    );
    if (stale.length === 0) return RA.ok(undefined);
    await db.delete(blueskyRepostsTable).where(condition);
    return RA.ok(undefined);
  },
});
