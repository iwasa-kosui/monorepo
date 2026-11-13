import type { PostDestination } from '../../domain/post/postDestination.ts';
import { Visibility } from '../../domain/post/visibility.ts';

export type PostVisibility = Exclude<Visibility, 'direct'>;

export const DEFAULT_POST_VISIBILITY: PostVisibility = 'public';

export const BLUESKY_ONLY_VISIBILITY_ERROR = 'Bluesky だけの投稿は公開でしか送れません';

export const visibilityWhenDefaultLoaded = (
  current: PostVisibility,
  loadedDefault: PostVisibility,
  state: Readonly<{ touched: boolean; destination: PostDestination }>,
): PostVisibility => (state.touched || state.destination === 'bluesky' ? current : loadedDefault);

export const visibilityForDestination = (destination: PostDestination, current: PostVisibility): PostVisibility =>
  destination === 'bluesky' ? 'public' : current;

export const visibilityWhenDestinationChanged = (
  current: PostVisibility,
  nextDestination: PostDestination,
  defaultVisibility: PostVisibility,
  touched: boolean,
): PostVisibility =>
  nextDestination === 'bluesky'
    ? visibilityForDestination(nextDestination, current)
    : touched
    ? current
    : defaultVisibility;

export const replyVisibilityDefault = (
  parent: Visibility | undefined,
  defaultVisibility: PostVisibility = DEFAULT_POST_VISIBILITY,
): PostVisibility => {
  const narrowest = parent === undefined
    ? defaultVisibility
    : Visibility.narrowestOf(defaultVisibility, parent);
  return narrowest === 'direct' ? 'private' : narrowest;
};

export const isWiderThan = (option: Visibility, parent: Visibility): boolean =>
  Visibility.narrowestOf(option, parent) !== option;
