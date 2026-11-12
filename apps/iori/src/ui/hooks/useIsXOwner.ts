import { useEffect, useState } from 'hono/jsx';

import { fetchXPosts } from '../api/mastodonClient.ts';

export type XOwnerState = Readonly<{ isOwner: boolean; isResolved: boolean }>;

export const useIsXOwner = (): XOwnerState => {
  const [state, setState] = useState<XOwnerState>({ isOwner: false, isResolved: false });

  useEffect(() => {
    fetchXPosts(1).then(
      () => setState({ isOwner: true, isResolved: true }),
      () => setState({ isOwner: false, isResolved: true }),
    );
  }, []);

  return state;
};
