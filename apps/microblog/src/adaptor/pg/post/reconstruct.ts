import { LocalPost, type Post, RemotePost } from '../../../domain/post/post.ts';

type PostRow = Readonly<{
  posts: {
    postId: string;
    actorId: string;
    content: string;
    createdAt: Date;
    type: string;
    deletedAt: Date | null;
  };
  local_posts: { postId: string; userId: string } | null;
  remote_posts: { postId: string; uri: string } | null;
}>;

export type ReconstructPostError = Readonly<{
  type: 'ReconstructPostError';
  message: string;
  detail: {
    postId: string;
  };
}>;

export const ReconstructPostError = {
  create: (postId: string, reason: string): ReconstructPostError => ({
    type: 'ReconstructPostError',
    message: `Failed to reconstruct post: ${reason}`,
    detail: { postId },
  }),
} as const;

export const reconstructPost = (row: PostRow): Post => {
  if (row.local_posts) {
    return LocalPost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      userId: row.local_posts.userId,
      type: 'local',
    });
  }

  if (row.remote_posts) {
    return RemotePost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      uri: row.remote_posts.uri,
      type: 'remote',
    });
  }

  throw new Error(`Post type could not be determined for postId: ${row.posts.postId}, type: ${row.posts.type}`);
};
