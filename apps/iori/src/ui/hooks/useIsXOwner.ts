import { useEffect, useState } from 'hono/jsx';

import { fetchXPosts } from '../api/mastodonClient.ts';

export const useIsXOwner = (): boolean => {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    fetchXPosts().then(() => setIsOwner(true), () => setIsOwner(false));
  }, []);

  return isOwner;
};
