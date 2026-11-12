import { useCallback, useEffect, useRef, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { IoriBlueskyActorBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import {
  blueskyFeedInfoFailureMessage,
  blueskyFeedLabel,
  blueskyFeedPostsFailureMessage,
  blueskyFeedUrlFailureMessage,
  blueskyListMembersFailureMessage,
  blueskySavedFeedsFailureMessage,
  type BlueskySavedFeedView,
  fetchBlueskyFeedInfo,
  fetchBlueskyFeedPosts,
  fetchBlueskyListMembers,
  fetchBlueskySavedFeeds,
  resolveBlueskyFeedUrl,
} from '../api/blueskyFeedClient.ts';
import { blueskyActorPagePath } from '../api/blueskyLinks.ts';
import { isUnauthorizedError } from '../api/mastodonClient.ts';
import { BlueskyActorRow } from '../components/BlueskyActorRow.tsx';
import { BlueskyPostList } from '../components/BlueskyPostList.tsx';
import { BlueskyStatusNotice } from '../components/BlueskyStatusNotice.tsx';
import { PagedList } from '../components/PagedList.tsx';
import { isStaleGeneration, startGeneration } from '../hooks/generation.ts';
import { useBlueskyStatus } from '../hooks/useBlueskyStatus.ts';
import {
  type BlueskyFeedView,
  fallbackFeedUriOf,
  feedUriOfSearch,
  feedViewOfSearch,
  selectedFeedOf,
  shownFeedsOf,
  unsavedFeedUriOf,
  withFeedUri,
  withFeedView,
} from './blueskyFeedSelection.ts';

type FeedsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; message: string }>
  | Readonly<{ kind: 'ready'; feeds: readonly BlueskySavedFeedView[] }>;

const mutedTextClass = 'text-charcoal-light dark:text-gray-400 mb-4';
const retryButtonClass =
  'rounded-clay bg-terracotta text-white px-4 py-2 shadow-clay-sm disabled:opacity-50 disabled:cursor-not-allowed';
const inputClass =
  'w-full rounded-clay bg-cream dark:bg-gray-800 shadow-clay-sm dark:shadow-clay-dark px-4 py-2 text-charcoal dark:text-gray-100';
const emptyBoxClass = 'bg-cream dark:bg-gray-800 rounded-clay shadow-clay dark:shadow-clay-dark p-8 text-center';

const emptyPostsMessageOf = (feed: BlueskySavedFeedView): string =>
  feed.kind === 'list' ? 'このリストにはまだ投稿がありません' : 'このフィードにはまだ投稿がありません';

const VIEW_TABS: readonly Readonly<{ view: BlueskyFeedView; label: string }>[] = [
  { view: 'posts', label: '投稿' },
  { view: 'members', label: 'メンバー' },
];

const actorKey = (actor: IoriBlueskyActorBody): string => actor.did;

const FeedBadge = ({ selected, children }: Readonly<{ selected: boolean; children: string }>) => (
  <span
    class={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
      selected ? 'bg-white/20 text-white' : 'bg-sand-light dark:bg-gray-700 text-charcoal-light dark:text-gray-300'
    }`}
  >
    {children}
  </span>
);

export const FeedButton = (
  { feed, selected, unsaved = false, onSelect }: Readonly<{
    feed: BlueskySavedFeedView;
    selected: boolean;
    unsaved?: boolean;
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
      {feed.kind === 'list' && <FeedBadge selected={selected}>リスト</FeedBadge>}
      {unsaved && <FeedBadge selected={selected}>保存していない</FeedBadge>}
    </button>
  );
};

export const FeedViewSwitch = (
  { view, onSelect }: Readonly<{ view: BlueskyFeedView; onSelect: (view: BlueskyFeedView) => void }>,
) => (
  <div role='tablist' class='flex gap-2 mb-4'>
    {VIEW_TABS.map((tab) => (
      <button
        key={tab.view}
        type='button'
        role='tab'
        aria-selected={tab.view === view}
        class={`rounded-clay px-4 py-2 shadow-clay-sm ${
          tab.view === view ? 'bg-terracotta text-white' : 'bg-cream dark:bg-gray-800 text-charcoal dark:text-gray-100'
        }`}
        onClick={() => onSelect(tab.view)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export const FeedUrlFormView = (
  { value, submitting, error, onInput, onSubmit }: Readonly<{
    value: string;
    submitting: boolean;
    error: string | undefined;
    onInput: (value: string) => void;
    onSubmit: (event: Event) => void;
  }>,
) => (
  <form class='mb-4' onSubmit={onSubmit}>
    <div class='flex gap-2'>
      <input
        type='url'
        class={inputClass}
        placeholder='bsky.app のフィードやリストの URL を開く'
        aria-label='bsky.app のフィードやリストの URL を開く'
        maxLength={300}
        value={value}
        onInput={(event: Event) => onInput((event.target as HTMLInputElement).value)}
      />
      <button type='submit' class={`${retryButtonClass} whitespace-nowrap shrink-0`} disabled={submitting}>
        開く
      </button>
    </div>
    {error !== undefined && <p role='alert' class='mt-2 text-sm text-red-600 dark:text-red-400'>{error}</p>}
  </form>
);

const FeedUrlForm = ({ onResolved }: Readonly<{ onResolved: (uri: string) => void }>) => {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    const url = value.trim();
    if (url === '' || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      onResolved(await resolveBlueskyFeedUrl(url));
      setValue('');
    } catch (cause) {
      if (isUnauthorizedError(cause)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to resolve the Bluesky feed URL:', cause);
      setError(blueskyFeedUrlFailureMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FeedUrlFormView
      value={value}
      submitting={submitting}
      error={error}
      onInput={setValue}
      onSubmit={handleSubmit}
    />
  );
};

const FeedsContent = () => {
  const [state, setState] = useState<FeedsState>({ kind: 'loading' });
  const [requestedUri, setRequestedUri] = useState(() => feedUriOfSearch(window.location.search));
  const [requestedView, setRequestedView] = useState(() => feedViewOfSearch(window.location.search));
  const [unsavedFeed, setUnsavedFeed] = useState<BlueskySavedFeedView | undefined>(undefined);
  const [unsavedError, setUnsavedError] = useState<Readonly<{ uri: string; message: string }> | undefined>(undefined);
  const [unsavedAttempt, setUnsavedAttempt] = useState(0);
  const generationRef = useRef<number | null>(null);
  const unsavedGenerationRef = useRef<number | null>(null);

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
    const handlePopState = () => {
      setRequestedUri(feedUriOfSearch(window.location.search));
      setRequestedView(feedViewOfSearch(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const savedFeeds = state.kind === 'ready' ? state.feeds : [];
  const unsavedUri = state.kind === 'ready' ? unsavedFeedUriOf(savedFeeds, requestedUri) : undefined;
  const loadedUnsavedUri = unsavedFeed?.uri;

  useEffect(() => {
    if (unsavedUri === undefined || loadedUnsavedUri === unsavedUri) {
      startGeneration(unsavedGenerationRef);
      return;
    }
    const generation = startGeneration(unsavedGenerationRef);
    setUnsavedError(undefined);
    fetchBlueskyFeedInfo(unsavedUri).then((feed) => {
      if (!isStaleGeneration(unsavedGenerationRef, generation)) setUnsavedFeed(feed);
    }, (error: unknown) => {
      if (isStaleGeneration(unsavedGenerationRef, generation)) return;
      if (isUnauthorizedError(error)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to load the unsaved Bluesky feed:', error);
      setUnsavedError({ uri: unsavedUri, message: blueskyFeedInfoFailureMessage(error) });
    });
  }, [unsavedUri, loadedUnsavedUri, unsavedAttempt]);

  const shownFeeds = shownFeedsOf(savedFeeds, unsavedFeed);
  const isUnsavedPending = unsavedUri !== undefined && loadedUnsavedUri !== unsavedUri;
  const selected = isUnsavedPending ? undefined : selectedFeedOf(shownFeeds, requestedUri);
  const selectedUri = selected?.uri;
  const view = selected?.kind === 'list' ? requestedView : 'posts';
  const loadPosts = useCallback(
    (cursor?: string) => fetchBlueskyFeedPosts(selectedUri ?? '', cursor),
    [selectedUri],
  );
  const loadMembers = useCallback(async (cursor?: string) => {
    const page = await fetchBlueskyListMembers(selectedUri ?? '', cursor);
    return { items: page.actors, cursor: page.cursor };
  }, [selectedUri]);

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

  const openUri = (uri: string) => {
    if (uri === selectedUri) return;
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${withFeedView(withFeedUri(window.location.search, uri), 'posts')}`,
    );
    setRequestedUri(uri);
    setRequestedView('posts');
  };

  const handleSelectView = (next: BlueskyFeedView) => {
    if (next === view) return;
    window.history.pushState(null, '', `${window.location.pathname}${withFeedView(window.location.search, next)}`);
    setRequestedView(next);
  };

  const urlForm = <FeedUrlForm onResolved={openUri} />;

  if (state.kind === 'loading') {
    return (
      <>
        {urlForm}
        <p class={mutedTextClass}>読み込んでいます</p>
      </>
    );
  }
  if (state.kind === 'error') {
    return (
      <>
        {urlForm}
        <div class='space-y-3'>
          <p class={mutedTextClass}>{state.message}</p>
          <button type='button' class={retryButtonClass} onClick={loadFeeds}>もう一度読み込む</button>
        </div>
      </>
    );
  }
  if (selected === undefined && !isUnsavedPending) {
    return (
      <>
        {urlForm}
        <div class={emptyBoxClass}>
          <p class='text-charcoal-light dark:text-gray-400'>
            保存したフィードとリストがありません。Bluesky のアプリで保存すると、ここに表示されます。
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      {urlForm}
      <div class='flex gap-2 overflow-x-auto pb-2 mb-4'>
        {shownFeeds.map((feed) => (
          <FeedButton
            key={feed.uri}
            feed={feed}
            selected={feed.uri === selectedUri}
            unsaved={feed.uri === loadedUnsavedUri && !savedFeeds.some(({ uri }) => uri === feed.uri)}
            onSelect={(next) => openUri(next.uri)}
          />
        ))}
      </div>
      {selected === undefined
        ? unsavedError?.uri === unsavedUri
          ? (
            <div class='space-y-3'>
              <p class={mutedTextClass}>{unsavedError?.message}</p>
              <button type='button' class={retryButtonClass} onClick={() => setUnsavedAttempt((count) => count + 1)}>
                もう一度読み込む
              </button>
            </div>
          )
          : <p class={mutedTextClass}>読み込んでいます</p>
        : (
          <>
            {selected.kind === 'list' && <FeedViewSwitch view={view} onSelect={handleSelectView} />}
            {view === 'members'
              ? (
                <PagedList
                  key={selected.uri}
                  load={loadMembers}
                  keyOf={actorKey}
                  failureMessage={blueskyListMembersFailureMessage}
                  emptyMessage='このリストにはまだメンバーがいません'
                  renderItem={(actor: IoriBlueskyActorBody) => (
                    <BlueskyActorRow key={actor.did} actor={actor} href={blueskyActorPagePath(actor)} />
                  )}
                />
              )
              : (
                <BlueskyPostList
                  load={loadPosts}
                  emptyMessage={emptyPostsMessageOf(selected)}
                  failureMessage={blueskyFeedPostsFailureMessage}
                />
              )}
          </>
        )}
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
