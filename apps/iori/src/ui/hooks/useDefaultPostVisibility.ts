import { useEffect, useState } from 'hono/jsx';

import { fetchPreferences } from '../api/mastodonClient.ts';
import { DEFAULT_POST_VISIBILITY, type PostVisibility } from '../components/postVisibility.ts';

export const useDefaultPostVisibility = (): PostVisibility => {
  const [visibility, setVisibility] = useState<PostVisibility>(DEFAULT_POST_VISIBILITY);

  useEffect(() => {
    fetchPreferences().then(
      (preferences) => setVisibility(preferences.defaultPostVisibility),
      () => undefined,
    );
  }, []);

  return visibility;
};
