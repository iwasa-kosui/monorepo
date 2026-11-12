import { appendUniqueBy } from './appendUnique.ts';

export type PagedListPage<T> = Readonly<{ items: readonly T[]; cursor: string | null }>;

export type PagedListReady<T> = Readonly<{
  kind: 'ready';
  items: readonly T[];
  cursor: string | undefined;
  loadMoreFailed: string | null;
}>;

export type PagedListState<T> =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; message: string }>
  | PagedListReady<T>;

export const firstPageOf = <T>(page: PagedListPage<T>): PagedListReady<T> => ({
  kind: 'ready',
  items: page.items,
  cursor: page.cursor ?? undefined,
  loadMoreFailed: null,
});

export const appendPageTo = <T>(
  prev: PagedListReady<T>,
  page: PagedListPage<T>,
  requestedCursor: string,
  keyOf: (item: T) => string,
): PagedListReady<T> => ({
  kind: 'ready',
  items: appendUniqueBy(prev.items, page.items, keyOf),
  cursor: page.cursor === null || page.cursor === requestedCursor ? undefined : page.cursor,
  loadMoreFailed: null,
});
