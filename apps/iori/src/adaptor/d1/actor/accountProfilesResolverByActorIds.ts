import { RA } from '@iwasa-kosui/result';
import { and, count, eq, inArray, isNull, max, min, sql } from 'drizzle-orm';

import type { AccountProfile, AccountProfilesResolverByActorIds } from '../../../domain/actor/accountProfile.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { User } from '../../../domain/user/user.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import {
  actorsTable,
  domainEventsTable,
  followsTable,
  localActorsTable,
  postsTable,
  remoteActorsTable,
  usersTable,
} from '../schema.ts';
import { toRemoteActorProfileFields } from './remoteActorProfileColumns.ts';

const toInstant = (value: Date | number | null | undefined): Instant | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return Instant.orThrow(value instanceof Date ? value.getTime() : value);
};

const unquote = (aggregateId: string): string =>
  aggregateId.startsWith('"') ? JSON.parse(aggregateId) as string : aggregateId;

export const createD1AccountProfilesResolverByActorIds = (db: IoriD1Db): AccountProfilesResolverByActorIds => ({
  resolve: async (actorIds) => {
    if (actorIds.length === 0) {
      return RA.ok(new Map());
    }
    const ids = [...new Set(actorIds)];
    const actorIdSelection = sql`(select value from json_each(${idsJson(ids)}))`;
    const aggregateIdSelection = sql`(select value from json_each(${
      idsJson(ids.flatMap((id) => [id, JSON.stringify(id)]))
    }))`;
    const [actorRows, followerRows, followingRows, statusRows, eventRows] = await Promise.all([
      db.select().from(actorsTable)
        .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
        .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
        .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
        .where(inArray(actorsTable.actorId, actorIdSelection)),
      db.select({ actorId: followsTable.followingId, count: count() }).from(followsTable)
        .where(inArray(followsTable.followingId, actorIdSelection)).groupBy(followsTable.followingId),
      db.select({ actorId: followsTable.followerId, count: count() }).from(followsTable)
        .where(inArray(followsTable.followerId, actorIdSelection)).groupBy(followsTable.followerId),
      db.select({
        actorId: postsTable.actorId,
        count: count(),
        createdAt: min(postsTable.createdAt),
        lastAt: max(postsTable.createdAt),
      }).from(postsTable)
        .where(and(inArray(postsTable.actorId, actorIdSelection), isNull(postsTable.deletedAt)))
        .groupBy(postsTable.actorId),
      db.select({ aggregateId: domainEventsTable.aggregateId, occurredAt: min(domainEventsTable.occurredAt) })
        .from(domainEventsTable)
        .where(inArray(domainEventsTable.aggregateId, aggregateIdSelection))
        .groupBy(domainEventsTable.aggregateId),
    ]);

    const followers = new Map(followerRows.map((row) => [row.actorId, Number(row.count)]));
    const following = new Map(followingRows.map((row) => [row.actorId, Number(row.count)]));
    const statuses = new Map(statusRows.map((row) => [row.actorId, row]));
    const eventTimes = new Map<string, Instant>();
    for (const row of eventRows) {
      const occurredAt = toInstant(row.occurredAt);
      const key = unquote(row.aggregateId);
      const known = eventTimes.get(key);
      if (occurredAt !== null && (known === undefined || occurredAt < known)) {
        eventTimes.set(key, occurredAt);
      }
    }

    const profiles = new Map<ActorId, AccountProfile>();
    for (const row of actorRows) {
      const id = ActorId.orThrow(row.actors.actorId);
      const status = statuses.get(row.actors.actorId);
      const stats = {
        followersCount: followers.get(row.actors.actorId) ?? 0,
        followingCount: following.get(row.actors.actorId) ?? 0,
        statusesCount: Number(status?.count ?? 0),
        createdAt: eventTimes.get(row.actors.actorId) ?? toInstant(status?.createdAt) ?? Instant.orThrow(0),
        lastStatusAt: toInstant(status?.lastAt),
      };
      if (row.local_actors !== null && row.users !== null) {
        const userId = UserId.orThrow(row.users.userId);
        profiles.set(id, {
          type: 'local',
          user: User.orThrow({ id: userId, username: Username.orThrow(row.users.username) }),
          actor: {
            id,
            userId,
            uri: row.actors.uri,
            inboxUrl: row.actors.inboxUrl,
            type: 'local',
            logoUri: row.actors.logoUri ?? undefined,
            displayName: row.local_actors.displayName ?? undefined,
            bio: row.local_actors.bio ?? undefined,
          },
          stats,
        });
      } else if (row.remote_actors !== null) {
        profiles.set(id, {
          type: 'remote',
          actor: {
            id,
            uri: row.actors.uri,
            inboxUrl: row.actors.inboxUrl,
            type: 'remote',
            url: row.remote_actors.url ?? undefined,
            username: row.remote_actors.username ?? undefined,
            logoUri: row.actors.logoUri ?? undefined,
            ...toRemoteActorProfileFields(row.remote_actors),
          },
          stats,
        });
      }
    }
    return RA.ok(profiles);
  },
});
