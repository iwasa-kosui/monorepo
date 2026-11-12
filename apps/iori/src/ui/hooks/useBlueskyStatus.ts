import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import { type BlueskyStatus, fetchBlueskyStatus } from '../api/mastodonClient.ts';
import { isStaleGeneration, startGeneration } from './generation.ts';

export type UseBlueskyStatusReturn = Readonly<{
  status: BlueskyStatus | undefined;
  loadFailed: boolean;
  reload: () => Promise<void>;
}>;

export const useBlueskyStatus = (): UseBlueskyStatusReturn => {
  const [status, setStatus] = useState<BlueskyStatus | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const generationRef = useRef(0);

  const reload = useCallback(async () => {
    const generation = startGeneration(generationRef);
    try {
      const next = await fetchBlueskyStatus();
      if (isStaleGeneration(generationRef, generation)) return;
      setStatus(next);
      setLoadFailed(false);
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      console.error('Failed to load the Bluesky status:', error);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { status, loadFailed, reload } as const;
};
