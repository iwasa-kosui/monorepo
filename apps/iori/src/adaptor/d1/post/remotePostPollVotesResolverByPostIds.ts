import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { PostId } from '../../../domain/post/postId.ts';
import type { RemotePostPollVotesResolverByPostIds } from '../../../domain/post/remotePostPollVote.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { fromD1 } from '../query.ts';
import { remotePostPollVotesTable } from '../schema.ts';

const jsonEach = (values: ReadonlyArray<string>) => sql`(select value from json_each(${idsJson(values)}))`;

export const createD1RemotePostPollVotesResolverByPostIds = (db: IoriD1Db): RemotePostPollVotesResolverByPostIds => ({
  resolve: ({ actorId, postIds }) =>
    RA.flow(
      fromD1(async () => {
        const votes = new Map<PostId, number[]>();
        if (postIds.length === 0) return votes;
        const rows = await db
          .select()
          .from(remotePostPollVotesTable)
          .where(and(
            eq(remotePostPollVotesTable.actorId, actorId),
            inArray(remotePostPollVotesTable.postId, jsonEach(postIds)),
          ))
          .orderBy(remotePostPollVotesTable.choice);
        for (const row of rows) {
          const postId = row.postId as PostId;
          votes.set(postId, [...votes.get(postId) ?? [], row.choice]);
        }
        return votes;
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
