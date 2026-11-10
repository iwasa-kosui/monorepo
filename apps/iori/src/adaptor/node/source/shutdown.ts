export const SHUTDOWN_DEADLINE_MS = 60_000;

export function createShutdown(
  { run, forceClose, exit, deadlineMs = SHUTDOWN_DEADLINE_MS }: {
    run: () => Promise<readonly PromiseSettledResult<unknown>[]>;
    forceClose: () => unknown;
    exit: (code: number) => void;
    deadlineMs?: number;
  },
) {
  let started = false;
  const force = () => {
    try {
      forceClose();
    } finally {
      exit(1);
    }
  };
  return async () => {
    if (started) {
      force();
      return;
    }
    started = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'deadline'>((resolve) => {
      timer = setTimeout(() => resolve('deadline'), deadlineMs);
    });
    const outcome = await Promise.race([run(), deadline]);
    clearTimeout(timer);
    if (outcome === 'deadline') {
      force();
      return;
    }
    exit(outcome.some((result) => result.status === 'rejected') ? 1 : 0);
  };
}
