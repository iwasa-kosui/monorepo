import { useEffect, useState } from 'hono/jsx';

import { fetchPreferences } from '../api/mastodonClient.ts';
import { DEFAULT_POST_VISIBILITY, type PostVisibility } from '../components/postVisibility.ts';

export const createDefaultPostVisibilityCache = (fetchDefault: () => Promise<PostVisibility>) => {
  let cached: Promise<PostVisibility> | undefined;

  return {
    load: (): Promise<PostVisibility> => {
      if (cached !== undefined) return cached;
      const promise = fetchDefault();
      cached = promise;
      promise.catch(() => {
        if (cached === promise) cached = undefined;
      });
      return promise;
    },
    replace: (visibility: PostVisibility): void => {
      cached = Promise.resolve(visibility);
    },
    clear: (): void => {
      cached = undefined;
    },
  };
};

const cache = createDefaultPostVisibilityCache(async () => (await fetchPreferences()).defaultPostVisibility);

export const replaceDefaultPostVisibility = cache.replace;

export const useDefaultPostVisibility = (): Readonly<{ defaultVisibility: PostVisibility; isLoading: boolean }> => {
  const [visibility, setVisibility] = useState<PostVisibility>(DEFAULT_POST_VISIBILITY);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    cache.load().then(
      (loaded) => {
        setVisibility(loaded);
        setIsLoading(false);
      },
      () => setIsLoading(false),
    );
  }, []);

  return { defaultVisibility: visibility, isLoading };
};
