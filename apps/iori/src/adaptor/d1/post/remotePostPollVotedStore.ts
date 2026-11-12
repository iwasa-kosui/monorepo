import { RA } from '@iwasa-kosui/result';
import { eq, type SQL, sql } from 'drizzle-orm';

import type { RemotePostPollVoted, RemotePostPollVotedStore } from '../../../domain/post/remotePostPollVote.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, remotePostPollsTable, remotePostPollVotesTable } from '../schema.ts';

const optionsWithVotes = (choices: ReadonlyArray<number>): SQL =>
  choices.reduce<SQL>(
    (options, choice) =>
      sql`json_set(${options}, ${`$[${choice}].votesCount`}, json_extract(${remotePostPollsTable.options}, ${`$[${choice}].votesCount`}) + 1)`,
    sql`${remotePostPollsTable.options}`,
  );

const statementsOf = (db: IoriD1Db, event: RemotePostPollVoted) => {
  const { postId, actorId, choices } = event.aggregateState;
  return [
    db.insert(remotePostPollVotesTable).values(
      choices.map((choice) => ({ postId, actorId, choice, createdAt: new Date(event.occurredAt) })),
    ),
    db.update(remotePostPollsTable).set({
      options: optionsWithVotes(choices),
      votersCount: sql`${remotePostPollsTable.votersCount} + 1`,
    }).where(eq(remotePostPollsTable.postId, postId)),
    db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
  ];
};

export const createD1RemotePostPollVotedStore = (db: IoriD1Db): RemotePostPollVotedStore => ({
  store: async (...events) => {
    await runBatch(db, events.flatMap((event) => statementsOf(db, event)));
    return RA.ok(undefined);
  },
});
