import { Post } from '../post/post.ts';

export const isSummarizable = (post: Post): boolean => Post.isVisibleToAnonymous(post);
