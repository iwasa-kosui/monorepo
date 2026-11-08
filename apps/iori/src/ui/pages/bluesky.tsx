import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import {
  failureMessage,
  fetchBlueskyTimeline,
  isMastodonApiError,
  isUnauthorizedError,
  refreshBlueskyTimeline,
} from '../api/mastodonClient.ts';
import { BlueskyTimelineItemView } from '../components/BlueskyTimelineItemView.tsx';
import type { BlueskyItemsUpdater } from '../hooks/optimisticBlueskyLike.ts';
import { useBlueskyLike } from '../hooks/useBlueskyLike.ts';

type BlueskyData = Readonly<{
  enabled: boolean;
  items: readonly IoriBlueskyTimelineItemBody[];
  nextBefore: number | null;
  nextBeforeId: string | null;
}>;

const appendUniqueByFeedItemId = (
  current: readonly IoriBlueskyTimelineItemBody[],
  next: readonly IoriBlueskyTimelineItemBody[],
): readonly IoriBlueskyTimelineItemBody[] => {
  const seen = new Set(current.map((item) => item.feedItemId));
  return [...current, ...next.filter((item) => !seen.has(item.feedItemId))];
};

const BlueskyPage = () => {
  const [data, setData] = useState<BlueskyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isBusyRef = useRef(false);
  const updateItems: BlueskyItemsUpdater = useCallback((updater) => {
    setData((prev) => prev === null ? prev : { ...prev, items: updater(prev.items) });
  }, []);
  const blueskyLike = useBlueskyLike(updateItems);

  const load = useCallback(async () => {
    try {
      setData(await fetchBlueskyTimeline());
      setError('');
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        window.location.href = '/sign-in';
        return;
      }
      setError(failureMessage('load the Bluesky timeline', loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async (before: number, beforeId: string | null) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setIsLoadingMore(true);
    try {
      const page = await fetchBlueskyTimeline(beforeId === null ? { before } : { before, beforeId });
      setData((prev) => prev === null ? prev : { ...page, items: appendUniqueByFeedItemId(prev.items, page.items) });
      setMessage('');
    } catch (loadError) {
      setMessage(failureMessage('load more posts', loadError));
    } finally {
      isBusyRef.current = false;
      setIsLoadingMore(false);
    }
  };

  const refresh = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setIsRefreshing(true);
    try {
      const result = await refreshBlueskyTimeline();
      setMessage(`${result.saved} 件を取り込みました`);
      await load();
    } catch (refreshError) {
      setMessage(
        isMastodonApiError(refreshError) && refreshError.status === 409
          ? '取り込みは無効です'
          : failureMessage('refresh the Bluesky timeline', refreshError),
      );
    } finally {
      isBusyRef.current = false;
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <section class='mb-8'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Bluesky</h1>
        <div class='flex items-center justify-center py-8'>
          <svg class='animate-spin h-8 w-8 text-terracotta' viewBox='0 0 24 24'>
            <circle class='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' stroke-width='4' fill='none' />
            <path
              class='opacity-75'
              fill='currentColor'
              d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
            />
          </svg>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section class='mb-8'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Bluesky</h1>
        <p role='alert' class='text-charcoal-light dark:text-gray-400'>{error}</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section class='mb-8'>
      <div class='flex items-center justify-between mb-6 gap-4'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white'>Bluesky</h1>
        {data.enabled && (
          <button
            type='button'
            onClick={refresh}
            disabled={isRefreshing}
            class='px-4 py-2 bg-sage-dark hover:bg-sage disabled:opacity-50 text-white text-sm font-medium rounded-clay transition-all shadow-clay-btn hover:shadow-clay-btn-hover active:translate-y-0.5 active:scale-[0.98]'
          >
            {isRefreshing ? '取得中...' : '今すぐ取得'}
          </button>
        )}
      </div>
      {!data.enabled && <p class='mb-4 text-sm text-charcoal-light dark:text-gray-400'>取り込みは無効です</p>}
      {message && <p role='status' class='mb-4 text-sm text-charcoal-light dark:text-gray-400'>{message}</p>}
      <div class='space-y-6 py-2'>
        {data.items.length > 0
          ? data.items.map((item) => (
            <BlueskyTimelineItemView
              key={item.feedItemId}
              item={item}
              onLike={blueskyLike.like}
              onUndoLike={blueskyLike.undoLike}
              isLikePending={blueskyLike.pendingUris.has(item.uri)}
            />
          ))
          : (
            <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
              <p class='text-charcoal-light dark:text-gray-400'>表示できる投稿はまだありません</p>
            </div>
          )}
      </div>
      {data.nextBefore !== null && (
        <div class='mt-6 text-center'>
          <button
            type='button'
            onClick={() => loadMore(data.nextBefore!, data.nextBeforeId)}
            disabled={isLoadingMore}
            class='px-4 py-2 bg-sand hover:bg-sand-light disabled:opacity-50 text-charcoal text-sm font-medium rounded-clay transition-all shadow-clay-sm'
          >
            {isLoadingMore ? '読み込み中...' : 'さらに読み込む'}
          </button>
        </div>
      )}
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<BlueskyPage />, root);
}
