import { and, inArray, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { actorsTable, followsTable, postsTable, remotePostRecipientsTable, remotePostsTable } from '../schema.ts';

const visibleRemotePost = alias(remotePostsTable, 'visible_remote_post');
const visibleRecipient = alias(remotePostRecipientsTable, 'visible_recipient');
const visibleViewerActor = alias(actorsTable, 'visible_viewer_actor');
const visibleFollow = alias(followsTable, 'visible_follow');

export const visibleToViewer = (
  input: Readonly<{ currentActorId: ActorId | undefined; onlyVisibleToViewer: boolean | undefined }>,
): SQL | undefined => {
  const { currentActorId } = input;
  if (input.onlyVisibleToViewer !== true || currentActorId === undefined) return undefined;
  return sql`(
    ${postsTable.type} = 'local'
    or exists (
      select 1 from ${remotePostsTable} ${visibleRemotePost}
      where ${visibleRemotePost.postId} = ${postsTable.postId}
        and (
          ${visibleRemotePost.visibility} in ('public', 'unlisted')
          or exists (
            select 1 from ${remotePostRecipientsTable} ${visibleRecipient}
            where ${visibleRecipient.postId} = ${postsTable.postId}
              and ${visibleRecipient.actorUri} = (
                select ${visibleViewerActor.uri} from ${actorsTable} ${visibleViewerActor}
                where ${visibleViewerActor.actorId} = ${currentActorId}
              )
          )
          or (
            (${visibleRemotePost.visibility} is null or ${visibleRemotePost.visibility} = 'private')
            and exists (
              select 1 from ${followsTable} ${visibleFollow}
              where ${visibleFollow.followerId} = ${currentActorId}
                and ${visibleFollow.followingId} = ${postsTable.actorId}
            )
          )
        )
    )
  )`;
};

export const selectVisiblePostIds = async (
  db: IoriD1Db,
  postIds: ReadonlyArray<PostId>,
  currentActorId: ActorId,
): Promise<ReadonlySet<string>> => {
  if (postIds.length === 0) return new Set();
  const rows = await db.select({ postId: postsTable.postId }).from(postsTable).where(and(
    inArray(postsTable.postId, sql`(select value from json_each(${idsJson(postIds)}))`),
    visibleToViewer({ currentActorId, onlyVisibleToViewer: true }),
  ));
  return new Set(rows.map((row) => row.postId));
};
