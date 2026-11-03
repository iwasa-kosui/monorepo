import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, or } from 'drizzle-orm';

import type { ThreadResolver } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { localPostsTable, postsTable, remotePostsTable } from '../schema.ts';
import { enrichPostRows, type PostRow, postRowsQuery } from './postWithAuthorBatch.ts';

const inReplyToUriOf = (row: PostRow): string | null =>
  row.local_posts?.inReplyToUri ?? row.remote_posts?.inReplyToUri ?? null;

export const createD1ThreadResolver = (db: IoriD1Db, origin: string): ThreadResolver => {
  const byId = async (postId: string): Promise<PostRow | undefined> => {
    const [row] = await postRowsQuery(db).where(and(eq(postsTable.postId, postId), isNull(postsTable.deletedAt)))
      .limit(1);
    return row;
  };
  const byUri = async (uri: string): Promise<PostRow | undefined> => {
    const [remote] = await postRowsQuery(db).where(and(eq(remotePostsTable.uri, uri), isNull(postsTable.deletedAt)))
      .limit(1);
    if (remote !== undefined) return remote;
    const parsed = new URL(uri);
    if (parsed.origin !== new URL(origin).origin) return undefined;
    const match = parsed.pathname.match(/^\/users\/[^/]+\/posts\/([^/]+)$/);
    return match === null ? undefined : byId(match[1]);
  };
  const uriOf = (row: PostRow): string =>
    row.remote_posts !== null
      ? row.remote_posts.uri
      : `${origin}/users/${row.users?.username ?? row.remote_actors?.username ?? 'unknown'}/posts/${row.posts.postId}`;
  const descendantRowsOf = (row: PostRow) =>
    postRowsQuery(db).where(and(
      isNull(postsTable.deletedAt),
      or(eq(localPostsTable.inReplyToUri, uriOf(row)), eq(remotePostsTable.inReplyToUri, uriOf(row))),
    ));
  const ancestorRowsOf = async (row: PostRow): Promise<PostRow[]> => {
    const ancestors: PostRow[] = [];
    const visited = new Set<string>();
    let ancestorUri = inReplyToUriOf(row);
    while (ancestorUri !== null && !visited.has(ancestorUri)) {
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
