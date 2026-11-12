import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyLikedPostsFailureMessage, fetchBlueskyLikedPosts } from '../api/blueskyProfileClient.ts';
import { isUnauthorizedError } from '../api/mastodonClient.ts';
import { appendUniqueBy } from '../hooks/appendUnique.ts';
import { isStaleGeneration, startGeneration } from '../hooks/generation.ts';
import type { BlueskyItemsUpdater } from '../hooks/optimisticBlueskyLike.ts';
import { useBlueskyQuoteDialog } from '../hooks/useBlueskyQuoteDialog.ts';
import { useBlueskyUriActions } from '../hooks/useBlueskyUriActions.ts';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll.ts';
import { blueskyItemActionProps, type BlueskyPostActions } from './blueskyPostActions.ts';
import { BlueskyQuoteModal, BlueskyReplyModal } from './BlueskyReplyModal.tsx';
import { BlueskyTimelineItemView } from './BlueskyTimelineItemView.tsx';

type LikedPostsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; message: string }>
  | Readonly<{
    kind: 'ready';
    items: readonly IoriBlueskyTimelineItemBody[];
    cursor: string | undefined;
    loadMoreFailed: string | null;
  }>;

const mutedTextClass = 'text-charcoal-light dark:text-gray-400 mb-4';
const retryButtonClass =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';

const itemKey = (item: IoriBlueskyTimelineItemBody): string => item.feedItemId;

export const BlueskyLikedPosts = () => {
  const [state, setState] = useState<LikedPostsState>({ kind: 'loading' });
  const generationRef = useRef<number | null>(null);
  const isFetchingMoreRef = useRef(false);

  const updateItems: BlueskyItemsUpdater = useCallback((updater) => {
    setState((prev) => {
      if (prev.kind !== 'ready') return prev;
      const items = updater(prev.items);
      return items === prev.items ? prev : { ...prev, items };
    });
  }, []);
  const { actions: uriActions, replyDialog } = useBlueskyUriActions(updateItems);
  const quoteDialog = useBlueskyQuoteDialog();
  const actions: BlueskyPostActions = { ...uriActions, onQuote: quoteDialog.open };

  const loadFirstPage = useCallback(async () => {
    const generation = startGeneration(generationRef);
    isFetchingMoreRef.current = false;
    setState({ kind: 'loading' });
    try {
      const page = await fetchBlueskyLikedPosts();
      if (isStaleGeneration(generationRef, generation)) return;
      setState({
        kind: 'ready',
        items: page.items,
        cursor: page.items.length === 0 ? undefined : page.cursor ?? undefined,
        loadMoreFailed: null,
      });
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      if (isUnauthorizedError(error)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to load Bluesky liked posts:', error);
      setState({ kind: 'error', message: blueskyLikedPostsFailureMessage(error, 'first') });
    }
  }, []);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async (cursor: string) => {
    if (isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;
    const generation = generationRef.current ?? 0;
    try {
      const page = await fetchBlueskyLikedPosts(cursor);
      if (isStaleGeneration(generationRef, generation)) return;
      const next = page.items.length === 0 || page.cursor === cursor ? undefined : page.cursor ?? undefined;
      setState((prev) =>
        prev.kind === 'ready'
          ? { ...prev, items: appendUniqueBy(prev.items, page.items, itemKey), cursor: next, loadMoreFailed: null }
          : prev
      );
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      console.error('Failed to load more Bluesky liked posts:', error);
      const message = blueskyLikedPostsFailureMessage(error, 'more');
      setState((prev) => prev.kind === 'ready' ? { ...prev, loadMoreFailed: message } : prev);
    } finally {
      isFetchingMoreRef.current = false;
    }
  }, []);

  useInfiniteScroll({
    nextCursor: state.kind === 'ready' && state.loadMoreFailed === null ? state.cursor : undefined,
    onLoadMore: loadMore,
    isFirstPageSettled: state.kind !== 'loading',
  });

  if (state.kind === 'loading') return <p class={mutedTextClass}>読み込んでいます</p>;
  if (state.kind === 'error') {
    return (
      <div class='space-y-3'>
        <p class={mutedTextClass}>{state.message}</p>
        <button type='button' class={retryButtonClass} onClick={loadFirstPage}>もう一度読み込む</button>
      </div>
    );
  }
  if (state.items.length === 0) {
    return (
      <div class='bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center'>
        <p class='text-charcoal-light dark:text-gray-400'>Bluesky でいいねした投稿はまだありません</p>
      </div>
    );
  }
  const retryCursor = state.loadMoreFailed === null ? undefined : state.cursor;
  return (
    <>
      <div class='space-y-6 py-2'>
        {state.items.map((item) => (
          <BlueskyTimelineItemView key={item.feedItemId} item={item} {...blueskyItemActionProps(actions, item)} />
        ))}
      </div>
      {retryCursor !== undefined && (
        <div class='py-4 space-y-3'>
          <p class='text-charcoal-light dark:text-gray-400'>{state.loadMoreFailed}</p>
          <button type='button' class={retryButtonClass} onClick={() => void loadMore(retryCursor)}>
            もう一度読み込む
          </button>
        </div>
      )}
      <BlueskyReplyModal dialog={replyDialog} />
      <BlueskyQuoteModal dialog={quoteDialog} />
    </>
  );
};
