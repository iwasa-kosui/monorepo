import type { Post } from '../post/post.ts';

export const isSummarizable = (post: Post): boolean =>
  post.type === 'local'
    ? post.visibility !== 'direct'
    : post.visibility === 'public' || post.visibility === 'unlisted' || post.visibility === 'private';
