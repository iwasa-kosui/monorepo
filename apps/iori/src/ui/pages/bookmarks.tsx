import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { bookmarksUrl, fetchBookmarks, isUnauthorizedError } from '../api/mastodonClient.ts';
import { readPageCache, writePageCache } from '../api/pageCache.ts';
import { clearAllCache } from '../api/responseCache.ts';
import { updateStatusesByPostId } from '../api/status.ts';
import { BlueskyBookmarksList } from '../components/BlueskyBookmarksList.tsx';
import { PostView } from '../components/PostView.tsx';
import { statusActionProps } from '../components/statusActionProps.ts';
import { appendUniqueById } from '../hooks/appendUnique.ts';
import { canStartPageLoadMore } from '../hooks/loadMoreGuard.ts';
import { useBlueskyStatus } from '../hooks/useBlueskyStatus.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';
import { useStatusListActions } from '../hooks/useStatusListActions.ts';
import {
  BOOKMARKS_SOURCE_TABS,
  type BookmarksSource,
  parseBookmarksSource,
  resolveBookmarksSource,
  withBookmarksSource,
} from './bookmarksSource.ts';

type BookmarksData = Readonly<{
  statuses: readonly Status[];
  nextMaxId: string | undefined;
}>;

const readCachedBookmarks = (): BookmarksData | null => {
  const cached = readPageCache<Status>(bookmarksUrl());
  return cached === undefined ? null : { statuses: cached.items, nextMaxId: cached.nextMaxId };
};

const FediverseBookmarks = () => {
  const [cached] = useState(readCachedBookmarks);
  const [data, setData] = useState<BookmarksData | null>(cached);
  const [isLoading, setIsLoading] = useState(cached === null);
  const [error, setError] = useState('');
  const [isFirstPageSettled, setIsFirstPageSettled] = useState(false);
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const page = await fetchBookmarks();
        writePageCache(bookmarksUrl(), page);
        setData({ statuses: page.items, nextMaxId: page.nextMaxId });
      } catch (fetchError) {
        if (isUnauthorizedError(fetchError)) {
          clearAllCache();
          window.location.href = '/sign-in';
          return;
        }
        if (cached !== null) return;
        setError(fetchError instanceof TypeError ? 'Network error. Please try again.' : 'Failed to load bookmarks');
      } finally {
        setIsLoading(false);
        setIsFirstPageSettled(true);
      }
    };
    loadBookmarks();
  }, []);

  const loadMore = useCallback(async (maxId: string) => {
    if (!canStartPageLoadMore(isLoadingMoreRef.current === true, isFirstPageSettled)) return;
    isLoadingMoreRef.current = true;
    try {
      const page = await fetchBookmarks({ maxId });
      const nextMaxId = page.items.length === 0 || page.nextMaxId === maxId ? undefined : page.nextMaxId;
      setData((prev) => prev === null ? prev : { statuses: appendUniqueById(prev.statuses, page.items), nextMaxId });
    } catch (loadError) {
      console.error('Failed to load more bookmarks:', loadError);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [isFirstPageSettled]);

  useInfiniteScroll({ nextCursor: data?.nextMaxId, onLoadMore: loadMore, isFirstPageSettled });

  const updateStatus = (postId: string, updater: (status: Status) => Status) => {
    setData((prev) =>
      prev === null ? prev : { ...prev, statuses: updateStatusesByPostId(prev.statuses, postId, updater) }
    );
  };

  const actions = useStatusListActions(updateStatus);

  if (isLoading) {
    return (
      <section class='mb-8'>
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
        <p class='text-charcoal-light dark:text-gray-400'>{error}</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section class='mb-8'>
      <div class='space-y-6 py-2'>
        {data.statuses.length > 0
          ? (
            data.statuses.map((status) => (
              <PostView
                key={status.id}
                status={status}
                isLoggedIn
                {...statusActionProps(actions, status)}
              />
            ))
          )
          : (
            <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
              <div class='w-16 h-16 mx-auto mb-4 rounded-clay bg-sand-light dark:bg-gray-700 flex items-center justify-center shadow-clay-sm'>
                <svg
                  class='w-8 h-8 text-charcoal-light dark:text-gray-500'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'
                  />
                </svg>
              </div>
              <p class='text-charcoal-light dark:text-gray-400'>
                ブックマークした投稿はまだありません
              </p>
            </div>
          )}
      </div>
    </section>
  );
};

const BookmarksPage = () => {
  const blueskyStatus = useBlueskyStatus();
  const [source, setSource] = useState<BookmarksSource>(() => parseBookmarksSource(window.location.search));
  const blueskyEnabled = blueskyStatus.status === undefined
    ? blueskyStatus.loadFailed ? false : undefined
    : blueskyStatus.status.enabled;
  const visible = resolveBookmarksSource(source, blueskyEnabled);

  useEffect(() => {
    const handlePopState = () => setSource(parseBookmarksSource(window.location.search));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectSource = (next: BookmarksSource) => {
    if (next === source) return;
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${withBookmarksSource(window.location.search, next)}`,
    );
    setSource(next);
  };

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Bookmarks</h1>
      {blueskyEnabled === true && (
        <div role='tablist' class='flex flex-wrap gap-2 mb-6'>
          {BOOKMARKS_SOURCE_TABS.map((tab) => (
            <button
              key={tab.source}
              type='button'
              role='tab'
              aria-selected={tab.source === visible}
              class={`rounded-clay px-4 py-2 shadow-clay-sm ${
                tab.source === visible
                  ? 'bg-terracotta text-white'
                  : 'bg-cream dark:bg-gray-800 text-charcoal dark:text-gray-100'
              }`}
              onClick={() => handleSelectSource(tab.source)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {visible === 'fediverse' && <FediverseBookmarks />}
      {visible === 'bluesky' && <BlueskyBookmarksList />}
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<BookmarksPage />, root);
}
