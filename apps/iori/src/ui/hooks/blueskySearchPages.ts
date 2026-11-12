import { isMastodonApiError } from '../api/mastodonClient.ts';
import type { BlueskySearchState } from './useBlueskySearch.ts';

export type BlueskySearchFailure = Readonly<{ status: number | undefined; code: string | undefined }>;

export const toSearchFailure = (error: unknown): BlueskySearchFailure =>
  isMastodonApiError(error) ? { status: error.status, code: error.code } : { status: undefined, code: undefined };

export const autoLoadCursor = (
  cursor: string | undefined,
  loadMoreFailure: BlueskySearchFailure | undefined,
): string | undefined => loadMoreFailure === undefined ? cursor : undefined;

export const nextSearchCursor = (
  requested: string | undefined,
  returned: string | null,
  itemCount: number,
): string | undefined => returned === null || itemCount === 0 || returned === requested ? undefined : returned;

export const withSearchItems = <T>(
  state: BlueskySearchState<T>,
  updater: (items: readonly T[]) => readonly T[],
): BlueskySearchState<T> => {
  if (state.kind !== 'ready') return state;
  const items = updater(state.items);
  return items === state.items ? state : { ...state, items };
};
