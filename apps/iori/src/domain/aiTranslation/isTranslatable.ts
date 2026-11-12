import type { Post } from '../post/post.ts';

// 閲覧できるかは呼び出し前に visibleToViewer で絞っている
export const isTranslatable = (post: Post): boolean => post.visibility !== 'direct';
