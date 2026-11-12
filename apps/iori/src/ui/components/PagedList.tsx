import type { PagedListPage, PagedListState } from '../hooks/pagedListState.ts';
import { usePagedList } from '../hooks/usePagedList.ts';

const mutedTextClass = 'text-charcoal-light dark:text-gray-400 mb-4';
const retryButtonClass =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';

type BodyProps<T> = Readonly<{
  state: PagedListState<T>;
  emptyMessage: string;
  renderItem: (item: T) => unknown;
  onRetryFirst: () => void;
  onRetryMore: (cursor: string) => void;
}>;

export const PagedListBody = <T,>({ state, emptyMessage, renderItem, onRetryFirst, onRetryMore }: BodyProps<T>) => {
  if (state.kind === 'loading') return <p class={mutedTextClass}>読み込んでいます</p>;
  if (state.kind === 'error') {
    return (
      <div class='space-y-3'>
        <p class={mutedTextClass}>{state.message}</p>
        <button type='button' class={retryButtonClass} onClick={onRetryFirst}>もう一度読み込む</button>
      </div>
    );
  }
  if (state.items.length === 0) {
    return (
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
        <p class='text-charcoal-light dark:text-gray-400'>{emptyMessage}</p>
      </div>
    );
  }
  const retryCursor = state.loadMoreFailed === null ? undefined : state.cursor;
  return (
    <>
      <div class='space-y-3 py-2'>{state.items.map(renderItem)}</div>
      {retryCursor !== undefined && (
        <div class='py-4 space-y-3'>
          <p class='text-charcoal-light dark:text-gray-400'>{state.loadMoreFailed}</p>
          <button type='button' class={retryButtonClass} onClick={() => onRetryMore(retryCursor)}>
            もう一度読み込む
          </button>
        </div>
      )}
    </>
  );
};

type Props<T> = Readonly<{
  load: (cursor?: string) => Promise<PagedListPage<T>>;
  keyOf: (item: T) => string;
  failureMessage: (error: unknown, kind: 'first' | 'more') => string;
  emptyMessage: string;
  renderItem: (item: T) => unknown;
}>;

export const PagedList = <T,>({ load, keyOf, failureMessage, emptyMessage, renderItem }: Props<T>) => {
  const { state, loadFirstPage, loadMore } = usePagedList({ load, keyOf, failureMessage });
  return (
    <PagedListBody
      state={state}
      emptyMessage={emptyMessage}
      renderItem={renderItem}
      onRetryFirst={() => void loadFirstPage()}
      onRetryMore={(cursor) => void loadMore(cursor)}
    />
  );
};
