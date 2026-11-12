const RECENT_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 200;

type Outcome = Readonly<{ ok: boolean }>;

export const createRecentRuns = <K, R extends Outcome>({
  now,
  recentResult,
}: Readonly<{ now: () => number; recentResult: () => Promise<R> }>) => {
  const inflight = new Map<K, Promise<R>>();
  const completedAt = new Map<K, number>();

  const remember = (key: K): void => {
    const at = now();
    completedAt.delete(key);
    completedAt.set(key, at);
    for (const [tracked, completed] of completedAt) {
      if (completedAt.size <= MAX_TRACKED_KEYS && at - completed < RECENT_WINDOW_MS) {
        break;
      }
      completedAt.delete(tracked);
    }
  };

  const isRecent = (key: K): boolean => {
    const completed = completedAt.get(key);
    return completed !== undefined && now() - completed < RECENT_WINDOW_MS;
  };

  return (key: K, execute: () => Promise<R>): Promise<R> => {
    if (isRecent(key)) {
      return recentResult();
    }
    const running = inflight.get(key);
    if (running !== undefined) {
      return running;
    }
    const started = execute().then((result) => {
      if (result.ok) {
        remember(key);
      }
      return result;
    }).finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, started);
    return started;
  };
};
