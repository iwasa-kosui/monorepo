import type { PostDestination } from '../../domain/post/postDestination.ts';
import type { Visibility } from '../../domain/post/visibility.ts';

export type PostVisibility = Exclude<Visibility, 'direct'>;

export const DEFAULT_POST_VISIBILITY: PostVisibility = 'public';

export const BLUESKY_ONLY_VISIBILITY_ERROR = 'Bluesky だけの投稿は公開でしか送れません';

export const visibilityForDestination = (destination: PostDestination, current: PostVisibility): PostVisibility =>
  destination === 'bluesky' ? 'public' : current;
