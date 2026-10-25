import { RA } from '@iwasa-kosui/result';

import type { PostCreated, PostCreatedStore, RemotePostCreated } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, localPostsTable, postsTable, remotePostsTable } from '../schema.ts';

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
        });
        const subtypeInsert = post.type === 'local'
          ? db.insert(localPostsTable).values({
            postId: post.postId,
            userId: post.userId,
            inReplyToUri: post.inReplyToUri,
          })
          : db.insert(remotePostsTable).values({
            postId: post.postId,
            uri: post.uri,
            inReplyToUri: post.inReplyToUri,
          });

        await db.batch([
          postInsert,
          subtypeInsert,
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
