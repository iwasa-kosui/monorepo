import { useCallback, useEffect, useState } from 'hono/jsx';

import {
  addXUserFeedSource,
  type FeedSource,
  fetchFeedSources,
  isUnauthorizedError,
  setFeedSourceEnabled,
} from '../api/mastodonClient.ts';
import {
  addXUserSource,
  runOptimisticToggle,
  toggleFailureMessage,
  withSource,
  xUserSourcesOf,
} from '../pages/xFeedSources.ts';
import { runExclusive } from './optimisticFavourite.ts';

const redirectToSignIn = () => {
  window.location.href = '/sign-in';
};

export const useXFeedSources = () => {
  const [sources, setSources] = useState<readonly FeedSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [username, setUsername] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [togglingIds, setTogglingIds] = useState<readonly string[]>([]);
  const [toggleError, setToggleError] = useState('');
  const [inFlightToggles] = useState(() => new Set<string>());

  const load = useCallback(async () => {
    try {
      setSources(xUserSourcesOf(await fetchFeedSources()));
      setLoadError('');
    } catch (fetchError) {
      if (isUnauthorizedError(fetchError)) {
        redirectToSignIn();
        return;
      }
      setLoadError('取り込むユーザーを読み込めませんでした');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
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

  const toggle = (source: FeedSource) =>
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

  return {
    sources,
    isLoading,
    loadError,
    username,
    setUsername,
    isAdding,
    addError,
    togglingIds,
    toggleError,
    add,
    toggle,
  };
};
