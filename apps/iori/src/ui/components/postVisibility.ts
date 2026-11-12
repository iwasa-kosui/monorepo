import type { Visibility } from '../../domain/post/visibility.ts';

export type PostVisibility = Exclude<Visibility, 'direct'>;

export const DEFAULT_POST_VISIBILITY: PostVisibility = 'public';
