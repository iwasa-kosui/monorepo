import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { LinkPreview } from '../../../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import { LocalPost, type PostWithAuthor, RemotePost, type ThreadResolver } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { Username } from '../../../domain/user/username.ts';
import type { IoriD1Db } from '../client.ts';
import {
  actorsTable,
  emojiReactsTable,
  likesTable,
  linkPreviewsTable,
  localActorsTable,
  localPostsTable,
  postImagesTable,
  postsTable,
  remoteActorsTable,
  remotePostsTable,
  repostsTable,
  usersTable,
} from '../schema.ts';

type PostRow = {
  posts: typeof postsTable.$inferSelect;
  local_posts: typeof localPostsTable.$inferSelect | null;
  remote_posts: typeof remotePostsTable.$inferSelect | null;
  actors: typeof actorsTable.$inferSelect;
  local_actors: typeof localActorsTable.$inferSelect | null;
  remote_actors: typeof remoteActorsTable.$inferSelect | null;
  users: typeof usersTable.$inferSelect | null;
};

const baseQuery = (db: IoriD1Db) =>
  db.select().from(postsTable)
    .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
    .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
    .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
    .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
    .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
    .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId));

const enrich = async (db: IoriD1Db, row: PostRow): Promise<PostWithAuthor> => {
  const postId = row.posts.postId;
  const [images, likeCount, repostCount, reactions, previews] = await Promise.all([
    db.select().from(postImagesTable).where(eq(postImagesTable.postId, postId)),
    db.select({ count: sql<number>`count(*)` }).from(likesTable).where(eq(likesTable.postId, postId)),
    db.select({ count: sql<number>`count(*)` }).from(repostsTable).where(eq(repostsTable.postId, postId)),
    db.select({
      emoji: emojiReactsTable.emoji,
      emojiImageUrl: emojiReactsTable.emojiImageUrl,
      count: sql<number>`count(*)`,
    }).from(emojiReactsTable).where(eq(emojiReactsTable.postId, postId)).groupBy(
      emojiReactsTable.emoji,
      emojiReactsTable.emojiImageUrl,
    ),
    db.select().from(linkPreviewsTable).where(eq(linkPreviewsTable.postId, postId)),
  ]);
  const common = {
    username: Username.orThrow(row.users?.username ?? row.remote_actors?.username ?? 'unknown'),
    logoUri: row.actors.logoUri ?? undefined,
    liked: false,
    reposted: false,
    images: images.map(({ url, altText }) => ({ url, altText })),
    likeCount: Number(likeCount[0]?.count ?? 0),
    repostCount: Number(repostCount[0]?.count ?? 0),
    reactions: reactions.map((reaction) => ({ ...reaction, count: Number(reaction.count) })),
    linkPreviews: previews.map((preview) =>
      LinkPreview.orThrow({
        ...preview,
        linkPreviewId: LinkPreviewId.orThrow(preview.linkPreviewId),
        postId: preview.postId as PostId,
        createdAt: preview.createdAt.getTime(),
      })
    ),
  };
  if (row.local_posts !== null) {
    return {
      ...LocalPost.orThrow({
        ...row.posts,
        ...row.local_posts,
        type: 'local',
        createdAt: row.posts.createdAt.getTime(),
      }),
      ...common,
    };
  }
  if (row.remote_posts !== null) {
    return {
      ...RemotePost.orThrow({
        ...row.posts,
        ...row.remote_posts,
        type: 'remote',
        createdAt: row.posts.createdAt.getTime(),
      }),
      ...common,
    };
  }
  throw new Error(`Post type could not be determined for ${postId}`);
};

export const createD1ThreadResolver = (db: IoriD1Db, origin: string): ThreadResolver => {
  const byId = async (postId: string): Promise<PostWithAuthor | null> => {
    const [row] = await baseQuery(db).where(and(eq(postsTable.postId, postId), isNull(postsTable.deletedAt))).limit(1);
    return row === undefined ? null : enrich(db, row);
  };
  const byUri = async (uri: string): Promise<PostWithAuthor | null> => {
    const [remote] = await baseQuery(db).where(and(eq(remotePostsTable.uri, uri), isNull(postsTable.deletedAt))).limit(
      1,
    );
    if (remote !== undefined) return enrich(db, remote);
    const parsed = new URL(uri);
    if (parsed.origin !== new URL(origin).origin) return null;
    const match = parsed.pathname.match(/^\/users\/[^/]+\/posts\/([^/]+)$/);
    return match === null ? null : byId(match[1]);
  };
  return {
    resolve: async ({ postId }) => {
      const currentPost = await byId(postId);
      const ancestors: PostWithAuthor[] = [];
      const visited = new Set<string>();
      let ancestorUri = currentPost?.inReplyToUri ?? null;
      while (ancestorUri !== null && !visited.has(ancestorUri)) {
        visited.add(ancestorUri);
        const ancestor = await byUri(ancestorUri);
        if (ancestor === null) break;
        ancestors.unshift(ancestor);
        ancestorUri = ancestor.inReplyToUri;
      }
      const descendants: PostWithAuthor[] = [];
      if (currentPost !== null) {
        const uri = currentPost.type === 'remote'
          ? currentPost.uri
          : `${origin}/users/${currentPost.username}/posts/${currentPost.postId}`;
        const rows = await baseQuery(db).where(and(
          isNull(postsTable.deletedAt),
          or(eq(localPostsTable.inReplyToUri, uri), eq(remotePostsTable.inReplyToUri, uri)),
        ));
        descendants.push(...await Promise.all(rows.map((row) => enrich(db, row))));
      }
      return RA.ok({ currentPost, ancestors, descendants });
    },
  };
};
