import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import { inArray, sql } from 'drizzle-orm';

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
          try {
            polls.set(
              row.postId as PostId,
              RemotePostPoll.parseOrThrow({
                multiple: row.multiple,
                options: JSON.parse(row.options),
                votersCount: row.votersCount,
                expiresAt: row.expiresAt === null ? null : row.expiresAt.getTime(),
                closed: row.closed,
              }),
            );
          } catch (error) {
            getLogger().warn(`Skipped a broken remote post poll for post ${row.postId}: ${String(error)}`);
          }
        }
        return polls;
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
