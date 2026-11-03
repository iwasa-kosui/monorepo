import type { Post } from '../post/post.ts';

export const isTranslatable = (post: Post): boolean => post.type === 'local' || post.visibility !== 'direct';
