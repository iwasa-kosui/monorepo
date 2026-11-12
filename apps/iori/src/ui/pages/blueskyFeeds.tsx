import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import {
  blueskyFeedLabel,
  blueskyFeedPostsFailureMessage,
  blueskySavedFeedsFailureMessage,
  type BlueskySavedFeedView,
  fetchBlueskyFeedPosts,
  fetchBlueskySavedFeeds,
} from '../api/blueskyFeedClient.ts';
import { isUnauthorizedError } from '../api/mastodonClient.ts';
import { BlueskyPostList } from '../components/BlueskyPostList.tsx';
import { BlueskyStatusNotice } from '../components/BlueskyStatusNotice.tsx';
import { isStaleGeneration, startGeneration } from '../hooks/generation.ts';
import { useBlueskyStatus } from '../hooks/useBlueskyStatus.ts';
import { fallbackFeedUriOf, feedUriOfSearch, selectedFeedOf, withFeedUri } from './blueskyFeedSelection.ts';

type FeedsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; message: string }>
  | Readonly<{ kind: 'ready'; feeds: readonly BlueskySavedFeedView[] }>;

const mutedTextClass = 'text-charcoal-light dark:text-gray-400 mb-4';
const retryButtonClass =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';
const emptyBoxClass = 'bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center';

const emptyPostsMessageOf = (feed: BlueskySavedFeedView): string =>
  feed.kind === 'list' ? 'このリストにはまだ投稿がありません' : 'このフィードにはまだ投稿がありません';

const FeedButton = (
  { feed, selected, onSelect }: Readonly<{
    feed: BlueskySavedFeedView;
    selected: boolean;
    onSelect: (feed: BlueskySavedFeedView) => void;
  }>,
) => {
  const label = blueskyFeedLabel(feed);
  return (
    <button
      type='button'
      aria-current={selected ? 'true' : undefined}
      title={feed.description}
      class={`flex flex-shrink-0 items-center gap-2 rounded-clay px-3 py-2 shadow-clay-sm ${
        selected ? 'bg-terracotta text-white' : 'bg-cream dark:bg-gray-800 text-charcoal dark:text-gray-100'
      }`}
      onClick={() => onSelect(feed)}
    >
      {feed.avatar !== undefined
        ? <img src={feed.avatar} alt='' class='w-6 h-6 rounded-full object-cover' />
        : (
          <span class='w-6 h-6 rounded-full bg-sand-light dark:bg-gray-700 text-charcoal dark:text-gray-200 flex items-center justify-center text-xs font-bold'>
            {label.charAt(0).toUpperCase()}
          </span>
        )}
      <span class='whitespace-nowrap'>{label}</span>
      {feed.kind === 'list' && (
        <span
          class={`rounded-full px-2 py-0.5 text-xs ${
            selected
              ? 'bg-white/20 text-white'
              : 'bg-sand-light dark:bg-gray-700 text-charcoal-light dark:text-gray-300'
          }`}
        >
          リスト
        </span>
      )}
    </button>
  );
};

const FeedsContent = () => {
  const [state, setState] = useState<FeedsState>({ kind: 'loading' });
  const [requestedUri, setRequestedUri] = useState(() => feedUriOfSearch(window.location.search));
  const generationRef = useRef<number | null>(null);

  const loadFeeds = useCallback(async () => {
    const generation = startGeneration(generationRef);
    setState({ kind: 'loading' });
    try {
      const feeds = await fetchBlueskySavedFeeds();
      if (isStaleGeneration(generationRef, generation)) return;
      setState({ kind: 'ready', feeds });
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      if (isUnauthorizedError(error)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to load saved Bluesky feeds:', error);
      setState({ kind: 'error', message: blueskySavedFeedsFailureMessage(error) });
    }
  }, []);

  useEffect(() => {
    void loadFeeds();
  }, [loadFeeds]);

  useEffect(() => {
    const handlePopState = () => setRequestedUri(feedUriOfSearch(window.location.search));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const selected = state.kind === 'ready' ? selectedFeedOf(state.feeds, requestedUri) : undefined;
  const selectedUri = selected?.uri;
  const loadPosts = useCallback(
    (cursor?: string) => fetchBlueskyFeedPosts(selectedUri ?? '', cursor),
    [selectedUri],
  );

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const fallbackUri = fallbackFeedUriOf(state.feeds, requestedUri);
    if (fallbackUri === undefined) return;
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${withFeedUri(window.location.search, fallbackUri)}`,
    );
    setRequestedUri(fallbackUri);
  }, [state, requestedUri]);

  const handleSelect = (feed: BlueskySavedFeedView) => {
    if (feed.uri === selectedUri) return;
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${withFeedUri(window.location.search, feed.uri)}`,
    );
    setRequestedUri(feed.uri);
  };

  if (state.kind === 'loading') return <p class={mutedTextClass}>読み込んでいます</p>;
  if (state.kind === 'error') {
    return (
      <div class='space-y-3'>
        <p class={mutedTextClass}>{state.message}</p>
        <button type='button' class={retryButtonClass} onClick={loadFeeds}>もう一度読み込む</button>
      </div>
    );
  }
  if (selected === undefined) {
    return (
      <div class={emptyBoxClass}>
        <p class='text-charcoal-light dark:text-gray-400'>
          保存したフィードとリストがありません。Bluesky のアプリで保存すると、ここに表示されます。
        </p>
      </div>
    );
  }
  return (
    <>
      <div class='flex gap-2 overflow-x-auto pb-2 mb-4'>
        {state.feeds.map((feed) => (
          <FeedButton key={feed.uri} feed={feed} selected={feed.uri === selected.uri} onSelect={handleSelect} />
        ))}
      </div>
      <BlueskyPostList
        load={loadPosts}
        emptyMessage={emptyPostsMessageOf(selected)}
        failureMessage={blueskyFeedPostsFailureMessage}
      />
    </>
  );
};

const FeedsPage = () => {
  const { status, loadFailed } = useBlueskyStatus();
  const isPending = status === undefined && !loadFailed;

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>フィード</h1>
      <div class='mb-4'>
        <BlueskyStatusNotice status={status} page='home' clientLoadFailed={loadFailed} />
      </div>
      {isPending
        ? null
        : status?.enabled === false
        ? (
          <div class={emptyBoxClass}>
            <p class='text-charcoal-light dark:text-gray-400'>Bluesky の連携が無効です</p>
          </div>
        )
        : <FeedsContent />}
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<FeedsPage />, root);
}
