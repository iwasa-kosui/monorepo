import { isSummarizable } from '../aiSummary/isSummarizable.ts';
import type { Post } from '../post/post.ts';

export const isTranslatable = (post: Post): boolean => isSummarizable(post);
