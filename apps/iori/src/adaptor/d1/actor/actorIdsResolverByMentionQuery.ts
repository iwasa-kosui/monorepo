import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';

import type { ActorIdsResolverByMentionQuery } from '../../../domain/actor/accountRelationship.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { IoriD1Db } from '../client.ts';
import { actorsTable, followsTable, localActorsTable, remoteActorsTable, usersTable } from '../schema.ts';

const likePrefix = (prefix: string): string => `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const hostOf = (value: string): string | undefined => {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return undefined;
  }
};

type Candidate = Readonly<{ actorId: string; username: string; host: string | undefined; rank: number }>;

const RANK_FOLLOWING = 0;
const RANK_FOLLOWER = 1;
const RANK_LOCAL = 2;

export const createD1ActorIdsResolverByMentionQuery = (db: IoriD1Db): ActorIdsResolverByMentionQuery => ({
  resolve: async ({ viewerActorId, username, host, limit }) => {
    const pattern = likePrefix(username);
    const following = db.select({ id: followsTable.followingId }).from(followsTable)
      .where(eq(followsTable.followerId, viewerActorId));
    const followers = db.select({ id: followsTable.followerId }).from(followsTable)
      .where(eq(followsTable.followingId, viewerActorId));
    const [localRows, remoteRows] = await Promise.all([
      db.select({ actorId: actorsTable.actorId, username: usersTable.username, uri: actorsTable.uri })
        .from(localActorsTable)
        .innerJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
        .innerJoin(actorsTable, eq(localActorsTable.actorId, actorsTable.actorId))
        .where(and(
          sql`${usersTable.username} like ${pattern} escape '\\'`,
          ne(actorsTable.actorId, viewerActorId),
        )),
      db.select({
        actorId: actorsTable.actorId,
        username: remoteActorsTable.username,
        uri: actorsTable.uri,
        url: remoteActorsTable.url,
        isFollowing: sql<number>`case when ${inArray(actorsTable.actorId, following)} then 1 else 0 end`,
      })
        .from(remoteActorsTable)
        .innerJoin(actorsTable, eq(remoteActorsTable.actorId, actorsTable.actorId))
        .where(and(
          sql`${remoteActorsTable.username} like ${pattern} escape '\\'`,
          or(inArray(actorsTable.actorId, following), inArray(actorsTable.actorId, followers)),
        )),
    ]);
    const candidates: Candidate[] = [
      ...remoteRows.flatMap((row): Candidate[] =>
        row.username === null ? [] : [{
          actorId: row.actorId,
          username: row.username,
          host: hostOf(row.url ?? row.uri),
          rank: Number(row.isFollowing) === 1 ? RANK_FOLLOWING : RANK_FOLLOWER,
        }]
      ),
      ...localRows.map((row): Candidate => ({
        actorId: row.actorId,
        username: row.username,
        host: hostOf(row.uri),
        rank: RANK_LOCAL,
      })),
    ];
    const lowerUsername = username.toLowerCase();
    const exactness = (candidate: Candidate): number => candidate.username.toLowerCase() === lowerUsername ? 0 : 1;
    const ranked = candidates
      .filter((candidate) => host === undefined || (candidate.host?.startsWith(host) ?? false))
      .sort((a, b) =>
        exactness(a) - exactness(b)
        || a.rank - b.rank
        || a.username.length - b.username.length
        || a.username.localeCompare(b.username)
      );
    return RA.ok(ranked.slice(0, limit).map((candidate) => ActorId.orThrow(candidate.actorId)));
  },
});
