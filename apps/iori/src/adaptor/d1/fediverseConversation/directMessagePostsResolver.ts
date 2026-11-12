import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type {
  DirectMessagePost,
  DirectMessagePostsResolver,
} from '../../../domain/fediverseConversation/fediverseConversation.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { visibleToViewer } from '../post/visibleToViewer.ts';
import {
  actorsTable,
  directPostParticipantsTable,
  notificationMentionsTable,
  notificationRepliesTable,
  notificationsTable,
  postsTable,
} from '../schema.ts';

const viewerParticipant = alias(directPostParticipantsTable, 'dm_viewer_participant');
const participantCount = alias(directPostParticipantsTable, 'dm_participant_count');
const participantInSet = alias(directPostParticipantsTable, 'dm_participant_in_set');

const hasViewerParticipant = (viewerUri: string): SQL =>
  sql`${postsTable.postId} in (
    select ${viewerParticipant.postId} from ${directPostParticipantsTable} ${viewerParticipant}
    where ${viewerParticipant.actorUri} = ${viewerUri}
  )`;

const hasExactParticipants = (uris: ReadonlyArray<string>): SQL =>
  sql`(
    (select count(*) from ${directPostParticipantsTable} ${participantCount}
      where ${participantCount.postId} = ${postsTable.postId}) = ${uris.length}
    and (select count(*) from ${directPostParticipantsTable} ${participantInSet}
      where ${participantInSet.postId} = ${postsTable.postId}
        and ${participantInSet.actorUri} in (select value from json_each(${idsJson(uris)}))) = ${uris.length}
  )`;

const hasUnreadNotification = (userId: string): SQL =>
  sql`(
    exists (
      select 1 from ${notificationMentionsTable}
      cross join ${notificationsTable}
      where ${notificationsTable.notificationId} = ${notificationMentionsTable.notificationId}
        and ${notificationMentionsTable.mentionPostId} = ${postsTable.postId}
        and ${notificationsTable.recipientUserId} = ${userId}
        and ${notificationsTable.isRead} = 0
    )
    or exists (
      select 1 from ${notificationRepliesTable}
      cross join ${notificationsTable}
      where ${notificationsTable.notificationId} = ${notificationRepliesTable.notificationId}
        and ${notificationRepliesTable.replyPostId} = ${postsTable.postId}
        and ${notificationsTable.recipientUserId} = ${userId}
        and ${notificationsTable.isRead} = 0
    )
  )`;

export const createD1DirectMessagePostsResolver = (db: IoriD1Db): DirectMessagePostsResolver => ({
  resolve: async ({ viewer, participantUris, unreadOnly, before, limit }) => {
    const unread = hasUnreadNotification(viewer.userId);
    const rows = await db.select({
      postId: postsTable.postId,
      authorActorId: postsTable.actorId,
      authorUri: actorsTable.uri,
      createdAt: postsTable.createdAt,
      content: postsTable.content,
      unread: sql<number>`case when ${unread} then 1 else 0 end`.mapWith(Number),
    })
      .from(postsTable)
      .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
      .where(and(
        isNull(postsTable.deletedAt),
        hasViewerParticipant(viewer.actorUri),
        visibleToViewer({ currentActorId: viewer.actorId, onlyVisibleToViewer: true }),
        participantUris === undefined
          ? undefined
          : hasExactParticipants([...new Set([viewer.actorUri, ...participantUris])]),
        unreadOnly === true ? unread : undefined,
        before === undefined ? undefined : or(
          lt(postsTable.createdAt, new Date(before.createdAt)),
          and(eq(postsTable.createdAt, new Date(before.createdAt)), lt(postsTable.postId, before.postId)),
        ),
      ))
      .orderBy(desc(postsTable.createdAt), desc(postsTable.postId))
      .limit(limit);
    if (rows.length === 0) return RA.ok([]);
    const participants = await db.select({
      postId: directPostParticipantsTable.postId,
      actorUri: directPostParticipantsTable.actorUri,
    })
      .from(directPostParticipantsTable)
      .where(inArray(
        directPostParticipantsTable.postId,
        sql`(select value from json_each(${idsJson(rows.map((row) => row.postId))}))`,
      ));
    const urisByPostId = new Map<string, string[]>();
    for (const { postId, actorUri } of participants) {
      urisByPostId.set(postId, [...(urisByPostId.get(postId) ?? []), actorUri]);
    }
    return RA.ok(rows.map((row): DirectMessagePost => ({
      postId: PostId.orThrow(row.postId),
      authorActorId: ActorId.orThrow(row.authorActorId),
      authorUri: row.authorUri,
      createdAt: row.createdAt.getTime(),
      content: row.content,
      unread: row.unread === 1,
      participantUris: urisByPostId.get(row.postId) ?? [],
    })));
  },
});
