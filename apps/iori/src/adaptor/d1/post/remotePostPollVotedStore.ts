import { RA } from '@iwasa-kosui/result';
import { and, eq, type SQL, sql } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { RemotePostPollVotedStore } from '../../../domain/post/remotePostPollVote.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, remotePostPollsTable, remotePostPollVotesTable } from '../schema.ts';

const optionsWithVotes = (choices: ReadonlyArray<number>): SQL =>
  choices.reduce<SQL>(
    (options, choice) =>
      sql`json_set(${options}, ${`$[${choice}].votesCount`}, json_extract(${remotePostPollsTable.options}, ${`$[${choice}].votesCount`}) + 1)`,
    sql`${remotePostPollsTable.options}`,
  );

const hasNoVote = (postId: PostId, actorId: ActorId): SQL =>
  sql`not exists (
    select 1 from ${remotePostPollVotesTable}
    where ${remotePostPollVotesTable.postId} = ${postId} and ${remotePostPollVotesTable.actorId} = ${actorId}
  )`;

export const createD1RemotePostPollVotedStore = (db: IoriD1Db): RemotePostPollVotedStore => ({
  store: async (event) => {
    const { postId, actorId, choices } = event.aggregateState;
    const guard = hasNoVote(postId, actorId);
    const results = await db.batch([
      db.update(remotePostPollsTable).set({
        options: optionsWithVotes(choices),
        votersCount: sql`${remotePostPollsTable.votersCount} + 1`,
      }).where(and(eq(remotePostPollsTable.postId, postId), guard)),
      db.insert(domainEventsTable).select(sql`
        select ${event.eventId}, ${JSON.stringify(event.aggregateId)}, ${event.aggregateName},
          ${JSON.stringify(event.aggregateState)}, ${event.eventName}, ${JSON.stringify(event.eventPayload)},
          ${event.occurredAt}
        where ${guard}
      `),
      db.insert(remotePostPollVotesTable).select(sql`
        select ${postId}, ${actorId}, value, ${event.occurredAt}
        from json_each(${JSON.stringify(choices)})
        where ${guard}
      `),
    ]);
    return RA.ok({ written: results[results.length - 1].meta.changes > 0 });
  },
});
