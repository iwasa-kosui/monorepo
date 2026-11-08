import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { favouritesUrl, fetchFavourites, isUnauthorizedError } from '../api/mastodonClient.ts';
import { readPageCache, writePageCache } from '../api/pageCache.ts';
import { clearAllCache } from '../api/responseCache.ts';
import { PostView } from '../components/PostView.tsx';
import { appendUniqueById } from '../hooks/appendUnique.ts';
import { canStartPageLoadMore } from '../hooks/loadMoreGuard.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';

type LikedPostsData = Readonly<{
  statuses: readonly Status[];
  nextMaxId: string | undefined;
}>;

const readCachedLikedPosts = (): LikedPostsData | null => {
  const cached = readPageCache<Status>(favouritesUrl());
  return cached === undefined ? null : { statuses: cached.items, nextMaxId: cached.nextMaxId };
};

const LikedPostsPage = () => {
  const [cached] = useState(readCachedLikedPosts);
  const [data, setData] = useState<LikedPostsData | null>(cached);
  const [isLoading, setIsLoading] = useState(cached === null);
  const [error, setError] = useState('');
  const [isFirstPageSettled, setIsFirstPageSettled] = useState(false);
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    const fetchLikedPosts = async () => {
      try {
        const page = await fetchFavourites();
        writePageCache(favouritesUrl(), page);
        setData({ statuses: page.items, nextMaxId: page.nextMaxId });
      } catch (fetchError) {
        if (isUnauthorizedError(fetchError)) {
          clearAllCache();
          window.location.href = '/sign-in';
          return;
        }
        if (cached !== null) return;
        setError(fetchError instanceof TypeError ? 'Network error. Please try again.' : 'Failed to load liked posts');
      } finally {
        setIsLoading(false);
        setIsFirstPageSettled(true);
      }
    };
    fetchLikedPosts();
  }, []);

  const loadMore = useCallback(async (maxId: string) => {
    if (!canStartPageLoadMore(isLoadingMoreRef.current === true, isFirstPageSettled)) return;
    isLoadingMoreRef.current = true;
    try {
      const page = await fetchFavourites({ maxId });
      const nextMaxId = page.items.length === 0 || page.nextMaxId === maxId ? undefined : page.nextMaxId;
      setData((prev) => prev === null ? prev : { statuses: appendUniqueById(prev.statuses, page.items), nextMaxId });
    } catch (loadError) {
      console.error('Failed to load more liked posts:', loadError);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [isFirstPageSettled]);

  useInfiniteScroll({ nextCursor: data?.nextMaxId, onLoadMore: loadMore, isFirstPageSettled });

  if (isLoading) {
    return (
      <section class='mb-8'>
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Liked Posts</h1>
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
        <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Liked Posts</h1>
        <p class='text-charcoal-light dark:text-gray-400'>{error}</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>Liked Posts</h1>

      <div class='space-y-6 py-2'>
        {data.statuses.length > 0
          ? (
            data.statuses.map((status) => <PostView key={status.id} status={status} isLoggedIn />)
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
                    d='M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z'
                  />
                </svg>
              </div>
              <p class='text-charcoal-light dark:text-gray-400'>
                No liked posts yet
              </p>
              <p class='text-sm text-warm-gray-dark dark:text-gray-500 mt-1'>
                Posts you like will appear here.
              </p>
            </div>
          )}
      </div>
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<LikedPostsPage />, root);
}
