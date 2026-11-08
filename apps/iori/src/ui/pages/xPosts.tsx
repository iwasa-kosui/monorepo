import { useEffect, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';

import type { IoriXPostBody } from '../../adaptor/routes/workerIoriXPostsRouter.ts';
import {
  addXUserFeedSource,
  type FeedSource,
  fetchFeedSources,
  fetchXPosts,
  isUnauthorizedError,
  setFeedSourceEnabled,
} from '../api/mastodonClient.ts';
import { XFeedSourceManager } from '../components/XFeedSourceManager.tsx';
import { XPostList } from '../components/XPostList.tsx';
import { runExclusive } from '../hooks/optimisticFavourite.ts';
import {
  addXUserSource,
  runOptimisticToggle,
  toggleFailureMessage,
  withSource,
  xUserSourcesOf,
} from './xFeedSources.ts';

const redirectToSignIn = () => {
  window.location.href = '/sign-in';
};

const XPostsPage = () => {
  const [sources, setSources] = useState<readonly FeedSource[]>([]);
  const [isSourcesLoading, setIsSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState('');
  const [username, setUsername] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [togglingIds, setTogglingIds] = useState<readonly string[]>([]);
  const [toggleError, setToggleError] = useState('');
  const [inFlightToggles] = useState(() => new Set<string>());
  const [posts, setPosts] = useState<readonly IoriXPostBody[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setPosts((await fetchXPosts()).posts);
      } catch (fetchError) {
        if (isUnauthorizedError(fetchError)) {
          window.location.href = '/sign-in';
          return;
        }
        setError(fetchError instanceof TypeError ? 'Network error. Please try again.' : 'Failed to load X posts');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadSources = async () => {
      try {
        setSources(xUserSourcesOf(await fetchFeedSources()));
      } catch (fetchError) {
        if (isUnauthorizedError(fetchError)) {
          redirectToSignIn();
          return;
        }
        setSourcesError('取り込むユーザーを読み込めませんでした');
      } finally {
        setIsSourcesLoading(false);
      }
    };
    loadSources();
  }, []);

  const handleAdd = async () => {
    if (isAdding) return;
    setIsAdding(true);
    setAddError('');
    const outcome = await addXUserSource({ input: username, request: addXUserFeedSource });
    setIsAdding(false);
    if (outcome.ok) {
      setSources((current) => withSource(current, outcome.source));
      setUsername('');
    } else if (isUnauthorizedError(outcome.error)) {
      redirectToSignIn();
    } else {
      setAddError(outcome.message);
    }
  };

  const handleToggle = (source: FeedSource) =>
    runExclusive(inFlightToggles, source.feedSourceId, async () => {
      setToggleError('');
      setTogglingIds((ids) => [...ids, source.feedSourceId]);
      try {
        await runOptimisticToggle({
          feedSourceId: source.feedSourceId,
          enabled: !source.enabled,
          request: setFeedSourceEnabled,
          updateSources: setSources,
        });
      } catch (toggleErrorValue) {
        if (isUnauthorizedError(toggleErrorValue)) redirectToSignIn();
        else setToggleError(toggleFailureMessage(toggleErrorValue));
      } finally {
        setTogglingIds((ids) => ids.filter((id) => id !== source.feedSourceId));
      }
    });

  return (
    <section class='mb-8'>
      <h1 class='text-2xl font-bold text-charcoal dark:text-white mb-6'>X</h1>
      {isSourcesLoading
        ? <p class='mb-8 text-charcoal-light dark:text-gray-400'>読み込み中...</p>
        : sourcesError
        ? <p role='alert' class='mb-8 text-charcoal-light dark:text-gray-400'>{sourcesError}</p>
        : (
          <XFeedSourceManager
            sources={sources}
            username={username}
            isAdding={isAdding}
            addError={addError}
            togglingIds={togglingIds}
            toggleError={toggleError}
            onUsernameInput={setUsername}
            onAdd={handleAdd}
            onToggle={handleToggle}
          />
        )}
      {isLoading
        ? (
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
        )
        : error
        ? <p class='text-charcoal-light dark:text-gray-400'>{error}</p>
        : posts.length === 0
        ? <p class='text-charcoal-light dark:text-gray-400'>取り込んだ投稿はありません</p>
        : <XPostList posts={posts} />}
    </section>
  );
};

if (globalThis.window) {
  const root = document.getElementById('root')!;
  render(<XPostsPage />, root);
}
