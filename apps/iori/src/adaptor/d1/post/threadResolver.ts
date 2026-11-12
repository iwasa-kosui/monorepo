import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { ThreadResolver } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import {
  actorsTable,
  localActorsTable,
  localPostsTable,
  postsTable,
  remoteActorsTable,
  remotePostsTable,
  usersTable,
} from '../schema.ts';
import { enrichPostRows, type PostRow, postRowsQuery } from './postWithAuthorBatch.ts';
import { selectVisiblePostIds } from './visibleToViewer.ts';

const MAX_ANCESTOR_DEPTH = 40;
const MAX_DESCENDANT_DEPTH = 20;
const MAX_DESCENDANTS = 60;

const ancestorPost = alias(postsTable, 'ancestor_post');
const ancestorLocal = alias(localPostsTable, 'ancestor_local');
const ancestorRemote = alias(remotePostsTable, 'ancestor_remote');
const ancestorUriRemote = alias(remotePostsTable, 'ancestor_uri_remote');
const ancestorUriPost = alias(postsTable, 'ancestor_uri_post');
const replyPost = alias(postsTable, 'reply_post');
const replyActor = alias(actorsTable, 'reply_actor');
const replyRemote = alias(remotePostsTable, 'reply_remote');
const replyLocalActor = alias(localActorsTable, 'reply_local_actor');
const replyRemoteActor = alias(remoteActorsTable, 'reply_remote_actor');
const replyUser = alias(usersTable, 'reply_user');
const replyOfLocal = alias(localPostsTable, 'reply_of_local');
const replyOfRemote = alias(remotePostsTable, 'reply_of_remote');

const canonicalLocalPostIdSql = (uri: SQL, prefix: string): SQL =>
  sql`case
    when substr(${uri}, 1, ${prefix.length}) = ${prefix}
      and length(${uri}) >= ${prefix.length + 44}
      and substr(${uri}, -43, 7) = '/posts/'
      and substr(${uri}, -36) not glob '*[^0-9A-Fa-f-]*'
      and substr(${uri}, ${prefix.length + 1}, length(${uri}) - ${prefix.length + 43}) not glob '*[^A-Za-z0-9_-]*'
    then substr(${uri}, -36)
  end`;

const ancestorCandidateIdsSql = (startUri: string, localUriPrefix: string): SQL => {
  const nextUri = sql`thread_ancestors.nextUri`;
  return sql`(
    with recursive thread_ancestors(depth, postId, nextUri) as (
      select 0, null, ${startUri}
      union all
      select
        thread_ancestors.depth + 1,
        ${ancestorPost.postId},
        coalesce(${ancestorLocal.inReplyToUri}, ${ancestorRemote.inReplyToUri})
      from thread_ancestors
      join ${postsTable} ${ancestorPost}
        on ${ancestorPost.deletedAt} is null
        and ${ancestorPost.postId} = coalesce(
          (
            select ${ancestorUriRemote.postId}
            from ${remotePostsTable} ${ancestorUriRemote}
            join ${postsTable} ${ancestorUriPost} on ${ancestorUriPost.postId} = ${ancestorUriRemote.postId}
            where ${ancestorUriRemote.uri} = ${nextUri} and ${ancestorUriPost.deletedAt} is null
          ),
          ${canonicalLocalPostIdSql(nextUri, localUriPrefix)}
        )
      left join ${localPostsTable} ${ancestorLocal} on ${ancestorLocal.postId} = ${ancestorPost.postId}
      left join ${remotePostsTable} ${ancestorRemote} on ${ancestorRemote.postId} = ${ancestorPost.postId}
      where thread_ancestors.depth < ${MAX_ANCESTOR_DEPTH}
    )
    select postId from thread_ancestors where postId is not null
  )`;
};

const descendantIdsSql = (rootPostId: string, rootUri: string, origin: string): SQL =>
  sql`(
    with recursive thread_descendants(depth, createdAt, postId, uri, skipped) as (
      select 0 as depth, 0 as createdAt, ${rootPostId} as postId, ${rootUri} as uri, 0 as skipped
      union all
      select
        thread_descendants.depth + 1,
        ${replyPost.createdAt},
        ${replyPost.postId},
        case
          when ${replyRemote.postId} is not null then ${replyRemote.uri}
          else ${origin} || '/users/' || coalesce(${replyUser.username}, ${replyRemoteActor.username}, 'unknown')
            || '/posts/' || ${replyPost.postId}
        end,
        ${replyPost.postId} = ${rootPostId}
      from thread_descendants
      join ${postsTable} ${replyPost}
        on ${replyPost.deletedAt} is null
        and ${replyPost.postId} in (
          select ${replyOfLocal.postId} from ${localPostsTable} ${replyOfLocal}
            where ${replyOfLocal.inReplyToUri} = thread_descendants.uri
          union
          select ${replyOfRemote.postId} from ${remotePostsTable} ${replyOfRemote}
            where ${replyOfRemote.inReplyToUri} = thread_descendants.uri
        )
      join ${actorsTable} ${replyActor} on ${replyActor.actorId} = ${replyPost.actorId}
      left join ${remotePostsTable} ${replyRemote} on ${replyRemote.postId} = ${replyPost.postId}
      left join ${localActorsTable} ${replyLocalActor} on ${replyLocalActor.actorId} = ${replyActor.actorId}
      left join ${remoteActorsTable} ${replyRemoteActor} on ${replyRemoteActor.actorId} = ${replyActor.actorId}
      left join ${usersTable} ${replyUser} on ${replyUser.userId} = ${replyLocalActor.userId}
      where thread_descendants.depth < ${MAX_DESCENDANT_DEPTH} and thread_descendants.skipped = 0
      order by depth, createdAt, postId
      limit ${MAX_DESCENDANTS + 1}
    )
    select postId from thread_descendants where depth > 0
  )`;

const parseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

const inReplyToUriOf = (row: PostRow): string | null =>
  row.local_posts?.inReplyToUri ?? row.remote_posts?.inReplyToUri ?? null;

export const createD1ThreadResolver = (db: IoriD1Db, origin: string): ThreadResolver => {
  const byId = async (postId: string): Promise<PostRow | undefined> => {
    const [row] = await postRowsQuery(db).where(and(eq(postsTable.postId, postId), isNull(postsTable.deletedAt)))
      .limit(1);
    return row;
  };
  const originUrl = new URL(origin);
  const localUriPrefix = `${originUrl.origin}/users/`;
  const canonicalLocalUriRest = /^[A-Za-z0-9_-]+\/posts\/([0-9A-Fa-f-]{36})$/;
  const canonicalLocalPostIdOf = (uri: string): string | undefined =>
    uri.startsWith(localUriPrefix) ? uri.slice(localUriPrefix.length).match(canonicalLocalUriRest)?.[1] : undefined;
  const byLocalUri = async (uri: string): Promise<PostRow | undefined> => {
    const parsed = parseUrl(uri);
    if (parsed === undefined || parsed.origin !== originUrl.origin) return undefined;
    const match = parsed.pathname.match(/^\/users\/[^/]+\/posts\/([^/]+)$/);
    return match === null ? undefined : byId(match[1]);
  };
  const byUri = async (uri: string): Promise<PostRow | undefined> => {
    const [remote] = await postRowsQuery(db).where(and(eq(remotePostsTable.uri, uri), isNull(postsTable.deletedAt)))
      .limit(1);
    return remote ?? byLocalUri(uri);
  };
  const uriOf = (row: PostRow): string =>
    row.remote_posts !== null
      ? row.remote_posts.uri
      : `${origin}/users/${row.users?.username ?? row.remote_actors?.username ?? 'unknown'}/posts/${row.posts.postId}`;
  const childRowsOf = (parentUris: ReadonlyArray<string>, limit: number) => {
    const uriSelection = sql`(select value from json_each(${idsJson(parentUris)}))`;
    return postRowsQuery(db).where(and(
      isNull(postsTable.deletedAt),
      or(inArray(localPostsTable.inReplyToUri, uriSelection), inArray(remotePostsTable.inReplyToUri, uriSelection)),
    )).orderBy(asc(postsTable.createdAt), asc(postsTable.postId)).limit(limit);
  };
  const orderedDescendants = (root: PostRow, childrenByParentUri: ReadonlyMap<string, PostRow[]>): PostRow[] => {
    const ordered: PostRow[] = [];
    const walk = (parent: PostRow): void => {
      for (const child of childrenByParentUri.get(uriOf(parent)) ?? []) {
        ordered.push(child);
        walk(child);
      }
    };
    walk(root);
    return ordered;
  };
  const descendantRowsByLevelOf = async (row: PostRow): Promise<PostRow[]> => {
    const childrenByParentUri = new Map<string, PostRow[]>();
    const visited = new Set<string>([row.posts.postId]);
    let frontier: PostRow[] = [row];
    let collected = 0;
    for (let depth = 1; depth <= MAX_DESCENDANT_DEPTH && frontier.length > 0 && collected < MAX_DESCENDANTS; depth++) {
      const children = await childRowsOf(frontier.map(uriOf), MAX_DESCENDANTS - collected);
      frontier = [];
      for (const child of children) {
        const parentUri = inReplyToUriOf(child);
        if (parentUri === null || visited.has(child.posts.postId)) continue;
        visited.add(child.posts.postId);
        collected++;
        frontier.push(child);
        const siblings = childrenByParentUri.get(parentUri);
        if (siblings === undefined) childrenByParentUri.set(parentUri, [child]);
        else siblings.push(child);
      }
    }
    return orderedDescendants(row, childrenByParentUri);
  };
  const descendantRowsOf = async (row: PostRow): Promise<PostRow[]> => {
    const rows = await postRowsQuery(db)
      .where(inArray(postsTable.postId, descendantIdsSql(row.posts.postId, uriOf(row), origin)))
      .orderBy(asc(postsTable.createdAt), asc(postsTable.postId));
    if (rows.some((descendant) => descendant.posts.postId === row.posts.postId)) {
      return descendantRowsByLevelOf(row);
    }
    const childrenByParentUri = new Map<string, PostRow[]>();
    for (const child of rows) {
      const parentUri = inReplyToUriOf(child);
      if (parentUri === null) continue;
      const siblings = childrenByParentUri.get(parentUri);
      if (siblings === undefined) childrenByParentUri.set(parentUri, [child]);
      else siblings.push(child);
    }
    return orderedDescendants(row, childrenByParentUri);
  };
  const ancestorRowsOf = async (row: PostRow): Promise<PostRow[]> => {
    const startUri = inReplyToUriOf(row);
    if (startUri === null) return [];
    const candidates = await postRowsQuery(db)
      .where(inArray(postsTable.postId, ancestorCandidateIdsSql(startUri, localUriPrefix)));
    const candidateById = new Map(candidates.map((candidate) => [candidate.posts.postId, candidate]));
    const candidateByRemoteUri = new Map(
      candidates.flatMap((candidate) =>
        candidate.remote_posts === null ? [] : [[candidate.remote_posts.uri, candidate]]
      ),
    );
    let withinCandidates = true;
    const resolve = async (uri: string): Promise<PostRow | undefined> => {
      if (!withinCandidates) return byUri(uri);
      const remote = candidateByRemoteUri.get(uri);
      if (remote !== undefined) return remote;
      const localPostId = canonicalLocalPostIdOf(uri);
      if (localPostId !== undefined) return candidateById.get(localPostId);
      withinCandidates = false;
      return byLocalUri(uri);
    };
    const ancestors: PostRow[] = [];
    const visited = new Set<string>([uriOf(row)]);
    let ancestorUri: string | null = startUri;
    while (ancestorUri !== null && !visited.has(ancestorUri) && ancestors.length < MAX_ANCESTOR_DEPTH) {
      visited.add(ancestorUri);
      const ancestor = await resolve(ancestorUri);
      if (ancestor === undefined) break;
      ancestors.unshift(ancestor);
      ancestorUri = inReplyToUriOf(ancestor);
    }
    return ancestors;
  };
  return {
    resolve: async ({ postId, currentActorId, onlyVisibleToViewer }) => {
      const currentRow = await byId(postId);
      if (currentRow === undefined) return RA.ok({ currentPost: null, ancestors: [], descendants: [] });
      const [ancestorRows, descendantRows] = await Promise.all([
        ancestorRowsOf(currentRow),
        descendantRowsOf(currentRow),
      ]);
      const visiblePostIds = onlyVisibleToViewer === true && currentActorId !== undefined
        ? await selectVisiblePostIds(
          db,
          [...ancestorRows, currentRow, ...descendantRows].map((row) => PostId.orThrow(row.posts.postId)),
          currentActorId,
        )
        : undefined;
      const isVisible = (row: PostRow): boolean => visiblePostIds?.has(row.posts.postId) ?? true;
      if (!isVisible(currentRow)) return RA.ok({ currentPost: null, ancestors: [], descendants: [] });
      const visibleAncestorRows = ancestorRows.filter(isVisible);
      const posts = await enrichPostRows(
        db,
        [...visibleAncestorRows, currentRow, ...descendantRows.filter(isVisible)],
        currentActorId,
      );
      return RA.ok({
        currentPost: posts[visibleAncestorRows.length],
        ancestors: posts.slice(0, visibleAncestorRows.length),
        descendants: posts.slice(visibleAncestorRows.length + 1),
      });
    },
  };
};
