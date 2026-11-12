import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, lt, or, type SQL, sql } from 'drizzle-orm';

import type { RemotePostUpdatedStore } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import {
  directPostParticipantsTable,
  domainEventsTable,
  postImagesTable,
  postsTable,
  remotePostRecipientsTable,
  remotePostsTable,
} from '../schema.ts';
import { RECIPIENT_ROWS_PER_INSERT } from './postCreatedStore.ts';

// D1 の束縛上限 100 に収まるよう、1 文あたり 6 列 × 10 行に分ける
const IMAGE_ROWS_PER_INSERT = 10;

const chunk = <T>(items: ReadonlyArray<T>, size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const isNotOlderEdit = (postId: PostId, editedAt: number): SQL =>
  sql`exists (
    select 1 from ${remotePostsTable}
    where ${remotePostsTable.postId} = ${postId}
      and (${remotePostsTable.editedAt} is null or ${remotePostsTable.editedAt} < ${editedAt})
  )`;

const narrowness = (visibility: SQL): SQL =>
  sql`(case ${visibility} when 'public' then 0 when 'unlisted' then 1 when 'private' then 2 else 3 end)`;

export const createD1RemotePostUpdatedStore = (db: IoriD1Db): RemotePostUpdatedStore => ({
  store: async (event) => {
    const post = event.aggregateState;
    const { recipientActorUris, participantActorUris, images } = event.eventPayload;
    const { editedAt } = post;
    if (editedAt === undefined || editedAt === null) {
      throw new Error(`The edited remote post ${post.postId} has no editedAt`);
    }
    const guard = isNotOlderEdit(post.postId, editedAt);

    const recipientInserts = chunk(recipientActorUris, RECIPIENT_ROWS_PER_INSERT).map((uris) =>
      db.insert(remotePostRecipientsTable).select(sql`
        select column1, column2 from (values ${sql.join(uris.map((uri) => sql`(${post.postId}, ${uri})`), sql`, `)})
        where ${guard}
      `)
    );
    const participantInserts = chunk(participantActorUris, RECIPIENT_ROWS_PER_INSERT).map((uris) =>
      db.insert(directPostParticipantsTable).select(sql`
        select column1, column2 from (values ${sql.join(uris.map((uri) => sql`(${post.postId}, ${uri})`), sql`, `)})
        where ${guard}
      `).onConflictDoNothing()
    );
    const imageInserts = chunk(images, IMAGE_ROWS_PER_INSERT).map((rows) =>
      db.insert(postImagesTable).select(sql`
        select column1, column2, column3, column4, column5, column6 from (values ${
        sql.join(
          rows.map((image) =>
            sql`(${image.imageId}, ${image.postId}, ${image.url}, ${image.altText}, ${image.mediaType}, ${image.createdAt})`
          ),
          sql`, `,
        )
      })
        where ${guard}
      `)
    );
    const visibility = post.visibility === null ? undefined : sql`(
      case when ${narrowness(sql`${post.visibility}`)} > ${
      narrowness(sql`coalesce(${remotePostsTable.visibility}, 'private')`)
    }
        then ${post.visibility}
        else ${remotePostsTable.visibility}
      end
    )`;

    const results = await db.batch([
      db.update(postsTable)
        .set({ content: post.content, summary: post.summary, sensitive: post.sensitive })
        .where(and(eq(postsTable.postId, post.postId), guard)),
      db.delete(remotePostRecipientsTable).where(and(eq(remotePostRecipientsTable.postId, post.postId), guard)),
      ...recipientInserts,
      ...participantInserts,
      db.delete(postImagesTable).where(and(eq(postImagesTable.postId, post.postId), guard)),
      ...imageInserts,
      db.insert(domainEventsTable).select(sql`
        select ${event.eventId}, ${event.aggregateId}, ${event.aggregateName}, ${JSON.stringify(event.aggregateState)},
          ${event.eventName}, ${JSON.stringify(event.eventPayload)}, ${event.occurredAt}
        where ${guard}
      `),
      db.update(remotePostsTable)
        .set({ editedAt: new Date(editedAt), visibility })
        .where(and(
          eq(remotePostsTable.postId, post.postId),
          or(isNull(remotePostsTable.editedAt), lt(remotePostsTable.editedAt, new Date(editedAt))),
        )),
    ]);
    return RA.ok({ written: results[results.length - 1].meta.changes === 1 });
  },
});
