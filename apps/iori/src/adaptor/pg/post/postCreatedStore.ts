import { RA } from '@iwasa-kosui/result';

import type { PostCreated, PostCreatedStore, RemotePostCreated } from '../../../domain/post/post.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, localPostsTable, postsTable, remotePostsTable } from '../schema.ts';

const store = async (event: PostCreated | RemotePostCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    const post = event.aggregateState;
    if (post.type === 'local') {
      await tx.insert(postsTable).values({
        postId: post.postId,
        actorId: post.actorId,
        content: post.content,
        createdAt: new Date(post.createdAt),
        type: 'local',
      });
      await tx.insert(localPostsTable).values({
        postId: post.postId,
        userId: post.userId,
        inReplyToUri: post.inReplyToUri,
      });
    }
    if (post.type === 'remote') {
      await tx.insert(postsTable).values({
        postId: post.postId,
        actorId: post.actorId,
        content: post.content,
        createdAt: new Date(post.createdAt),
        type: 'remote',
      });
      await tx.insert(remotePostsTable).values({
        postId: post.postId,
        uri: post.uri,
        inReplyToUri: post.inReplyToUri,
      });
    }
    await tx.insert(domainEventsTable).values({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: event.aggregateState,
      eventName: event.eventName,
      eventPayload: event.eventPayload,
      occurredAt: new Date(event.occurredAt),
    });
  });
  return RA.ok(undefined);
};
const getInstance = singleton((): PostCreatedStore => ({
  store,
}));

export const PgPostCreatedStore = {
  getInstance,
} as const;
