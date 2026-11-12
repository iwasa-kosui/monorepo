import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { RemotePostPoll, type RemotePostPollsResolverByPostIds } from '../../../domain/post/remotePostPoll.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { fromD1 } from '../query.ts';
import { remotePostPollsTable } from '../schema.ts';

const jsonEach = (values: ReadonlyArray<string>) => sql`(select value from json_each(${idsJson(values)}))`;

export const createD1RemotePostPollsResolverByPostIds = (db: IoriD1Db): RemotePostPollsResolverByPostIds => ({
  resolve: (postIds) =>
    RA.flow(
      fromD1(async () => {
        const polls = new Map<PostId, RemotePostPoll>();
        if (postIds.length === 0) return polls;
        const rows = await db
          .select()
          .from(remotePostPollsTable)
          .where(inArray(remotePostPollsTable.postId, jsonEach(postIds)));
        for (const row of rows) {
          polls.set(
            row.postId as PostId,
            RemotePostPoll.orThrow({
              multiple: row.multiple,
              options: JSON.parse(row.options),
              votersCount: row.votersCount,
              expiresAt: row.expiresAt === null ? null : Instant.orThrow(row.expiresAt.getTime()),
              closed: row.closed,
            }),
          );
        }
        return polls;
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
