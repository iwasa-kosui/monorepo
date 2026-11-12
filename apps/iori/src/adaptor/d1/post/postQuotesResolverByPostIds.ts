import { RA } from '@iwasa-kosui/result';
import { eq, inArray, sql } from 'drizzle-orm';

import type { PostQuote, PostQuotesResolverByPostIds } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { fromD1 } from '../query.ts';
import { actorsTable, postQuotesTable, postsTable, remoteActorsTable, remotePostsTable } from '../schema.ts';

const jsonEach = (values: ReadonlyArray<string>) => sql`(select value from json_each(${idsJson(values)}))`;

export const createD1PostQuotesResolverByPostIds = (db: IoriD1Db): PostQuotesResolverByPostIds => ({
  resolve: (postIds) =>
    RA.flow(
      fromD1(async () => {
        const quotes = new Map<PostId, PostQuote>();
        if (postIds.length === 0) return quotes;
        const rows = await db
          .select({
            postId: postQuotesTable.postId,
            quoteUri: postQuotesTable.quoteUri,
            authorUri: actorsTable.uri,
            authorInboxUrl: actorsTable.inboxUrl,
            authorUsername: remoteActorsTable.username,
          })
          .from(postQuotesTable)
          .leftJoin(remotePostsTable, eq(remotePostsTable.uri, postQuotesTable.quoteUri))
          .leftJoin(postsTable, eq(postsTable.postId, remotePostsTable.postId))
          .leftJoin(actorsTable, eq(actorsTable.actorId, postsTable.actorId))
          .leftJoin(remoteActorsTable, eq(remoteActorsTable.actorId, actorsTable.actorId))
          .where(inArray(postQuotesTable.postId, jsonEach(postIds)));
        for (const row of rows) {
          const postId = row.postId as PostId;
          if (quotes.has(postId)) continue;
          quotes.set(postId, {
            uri: row.quoteUri,
            author: row.authorUri === null || row.authorInboxUrl === null
              ? null
              : { id: row.authorUri, inboxUrl: row.authorInboxUrl, username: row.authorUsername },
          });
        }
        return quotes;
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
