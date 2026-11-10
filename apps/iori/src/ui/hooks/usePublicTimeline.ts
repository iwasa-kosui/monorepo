import { useCallback, useRef, useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { fetchPublicTimeline, type Page, type PublicTimelineScope } from '../api/mastodonClient.ts';
import {
  emptyPublicTimeline,
  type PublicTimelineState,
  stateAfterLoadMore,
  stateFromFirstPage,
} from './publicTimelinePages.ts';
import { useInfiniteScroll } from './useInfiniteScroll.ts';

export type UsePublicTimelineReturn = Readonly<{
  items: readonly Status[];
  setFirstPage: (page: Page<Status>) => void;
}>;

export const usePublicTimeline = (scope: PublicTimelineScope): UsePublicTimelineReturn => {
  const [state, setState] = useState<PublicTimelineState>(emptyPublicTimeline);
  const isLoadingMoreRef = useRef(false);

  const setFirstPage = useCallback((page: Page<Status>) => {
    setState(stateFromFirstPage(page));
  }, []);

  const loadMore = useCallback(async (maxId: string) => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    try {
      const page = await fetchPublicTimeline(scope, { maxId });
      setState((prev) => stateAfterLoadMore(prev, page, maxId));
    } catch (loadError) {
      console.error('Failed to load more public timeline posts:', loadError);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [scope]);

  useInfiniteScroll({ nextCursor: state.nextMaxId, onLoadMore: loadMore });

  return { items: state.items, setFirstPage };
};
