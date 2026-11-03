import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type { ThreadResolver } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { localPostsTable, postsTable, remotePostsTable } from '../schema.ts';
import { enrichPostRows, type PostRow, postRowsQuery } from './postWithAuthorBatch.ts';

const MAX_ANCESTOR_DEPTH = 40;
const MAX_DESCENDANT_DEPTH = 20;
const MAX_DESCENDANTS = 60;

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
  const byUri = async (uri: string): Promise<PostRow | undefined> => {
    const [remote] = await postRowsQuery(db).where(and(eq(remotePostsTable.uri, uri), isNull(postsTable.deletedAt)))
      .limit(1);
    if (remote !== undefined) return remote;
    const parsed = parseUrl(uri);
    if (parsed === undefined || parsed.origin !== originUrl.origin) return undefined;
    const match = parsed.pathname.match(/^\/users\/[^/]+\/posts\/([^/]+)$/);
    return match === null ? undefined : byId(match[1]);
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
  const descendantRowsOf = async (row: PostRow): Promise<PostRow[]> => {
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
    const ordered: PostRow[] = [];
    const walk = (parent: PostRow): void => {
      for (const child of childrenByParentUri.get(uriOf(parent)) ?? []) {
        ordered.push(child);
        walk(child);
      }
    };
    walk(row);
    return ordered;
  };
  const ancestorRowsOf = async (row: PostRow): Promise<PostRow[]> => {
    const ancestors: PostRow[] = [];
    const visited = new Set<string>([uriOf(row)]);
    let ancestorUri = inReplyToUriOf(row);
    while (ancestorUri !== null && !visited.has(ancestorUri) && ancestors.length < MAX_ANCESTOR_DEPTH) {
      visited.add(ancestorUri);
      const ancestor = await byUri(ancestorUri);
      if (ancestor === undefined) break;
      ancestors.unshift(ancestor);
      ancestorUri = inReplyToUriOf(ancestor);
    }
    return ancestors;
  };
  return {
    resolve: async ({ postId, currentActorId }) => {
      const currentRow = await byId(postId);
      if (currentRow === undefined) return RA.ok({ currentPost: null, ancestors: [], descendants: [] });
      const [ancestorRows, descendantRows] = await Promise.all([
        ancestorRowsOf(currentRow),
        descendantRowsOf(currentRow),
      ]);
      const posts = await enrichPostRows(db, [...ancestorRows, currentRow, ...descendantRows], currentActorId);
      return RA.ok({
        currentPost: posts[ancestorRows.length],
        ancestors: posts.slice(0, ancestorRows.length),
        descendants: posts.slice(ancestorRows.length + 1),
      });
    },
  };
};
