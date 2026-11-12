import { RA } from '@iwasa-kosui/result';

import type { PostCreated, PostCreatedStore, RemotePostCreated } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import {
  domainEventsTable,
  localPostsTable,
  postQuotesTable,
  postsTable,
  remotePostRecipientsTable,
  remotePostsTable,
} from '../schema.ts';

// D1 の束縛上限 100 に収まるよう、1 文あたり 2 列 × 40 行に分ける
const RECIPIENT_ROWS_PER_INSERT = 40;

const recipientInserts = (db: IoriD1Db, event: PostCreated | RemotePostCreated) => {
  if (event.eventName !== 'post.remotePostCreated') return [];
  const { postId } = event.aggregateState;
  const { recipientActorUris } = event.eventPayload;
  const inserts = [];
  for (let i = 0; i < recipientActorUris.length; i += RECIPIENT_ROWS_PER_INSERT) {
    inserts.push(
      db.insert(remotePostRecipientsTable).values(
        recipientActorUris.slice(i, i + RECIPIENT_ROWS_PER_INSERT).map((actorUri) => ({ postId, actorUri })),
      ),
    );
  }
  return inserts;
};

const quoteInserts = (db: IoriD1Db, event: PostCreated | RemotePostCreated) => {
  const { quoteUri } = event.eventPayload;
  if (quoteUri === null) return [];
  return [db.insert(postQuotesTable).values({ postId: event.aggregateState.postId, quoteUri })];
};

export const createD1PostCreatedStore = (db: IoriD1Db): PostCreatedStore => ({
  store: (event: PostCreated | RemotePostCreated) =>
    RA.flow(
      fromD1(async () => {
        const post = event.aggregateState;
        const postInsert = db.insert(postsTable).values({
          postId: post.postId,
          actorId: post.actorId,
          content: post.content,
          createdAt: new Date(post.createdAt),
          type: post.type,
          summary: post.summary,
          sensitive: post.sensitive,
        });
        const subtypeInsert = post.type === 'local'
          ? db.insert(localPostsTable).values({
            postId: post.postId,
            userId: post.userId,
            inReplyToUri: post.inReplyToUri,
            visibility: post.visibility,
          })
          : db.insert(remotePostsTable).values({
            postId: post.postId,
            uri: post.uri,
            inReplyToUri: post.inReplyToUri,
            visibility: post.visibility,
          });

        await db.batch([
          postInsert,
          subtypeInsert,
          ...recipientInserts(db, event),
          ...quoteInserts(db, event),
          db.insert(domainEventsTable).values({
            eventId: event.eventId,
            aggregateId: event.aggregateId,
            aggregateName: event.aggregateName,
            aggregateState: JSON.stringify(event.aggregateState),
            eventName: event.eventName,
            eventPayload: JSON.stringify(event.eventPayload),
            occurredAt: new Date(event.occurredAt),
          }),
        ]);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
