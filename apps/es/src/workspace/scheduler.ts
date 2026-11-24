export type SchedulerStatus = 'idle' | 'running' | 'paused' | 'ended';

export type ScheduledItem = { readonly at: number; readonly run: () => void };

export type WaitingItem = {
  readonly when: string;
  readonly key?: string | undefined;
  readonly run: () => void;
};

export type Recurring = {
  readonly everyMs: number;
  readonly run: (index: number) => void;
};

export type SchedulerOptions = {
  readonly now: () => number;
  readonly recurring?: readonly Recurring[];
  readonly onStatus?: (status: SchedulerStatus) => void;
  readonly onTick?: (changed: boolean) => void;
};

export type Scheduler = {
  readonly status: () => SchedulerStatus;
  readonly elapsedMs: () => number;
  readonly start: (items: readonly ScheduledItem[], waiting?: readonly WaitingItem[]) => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly reset: () => void;
  readonly tick: () => void;
  readonly schedule: (items: readonly ScheduledItem[]) => void;
  readonly signal: (name: string, key?: string) => void;
  readonly finish: (atMs: number) => void;
};

export const tickMs = 250;

const byTime = (a: ScheduledItem, b: ScheduledItem): number => a.at - b.at;

export const createScheduler = (options: SchedulerOptions): Scheduler => {
  const recurring = options.recurring ?? [];
  let status: SchedulerStatus = 'idle';
  let startedMs = 0;
  let pausedAt: number | null = null;
  let pausedTotal = 0;
  let frozenMs: number | null = null;
  let queue: ScheduledItem[] = [];
  let waiting: WaitingItem[] = [];
  let nextIndex: number[] = recurring.map(() => 1);

  const setStatus = (next: SchedulerStatus): void => {
    status = next;
    options.onStatus?.(status);
  };

  const elapsedMs = (): number => {
    if (status === 'idle') return 0;
    if (frozenMs !== null) return frozenMs;
    return Math.max(0, (pausedAt ?? options.now()) - startedMs - pausedTotal);
  };

  const dueRecurring = (): { slot: number; at: number } | undefined => {
    let found: { slot: number; at: number } | undefined;
    for (const [slot, rule] of recurring.entries()) {
      const at = (nextIndex[slot] ?? 1) * rule.everyMs;
      if (found === undefined || at < found.at) found = { slot, at };
    }
    return found;
  };

  const tick = (): void => {
    if (status !== 'running') return;
    const now = elapsedMs();
    let changed = false;
    for (;;) {
      const head = queue[0];
      const beat = dueRecurring();
      if (beat !== undefined && beat.at <= now && (head === undefined || beat.at <= head.at)) {
        const index = nextIndex[beat.slot] ?? 1;
        nextIndex[beat.slot] = index + 1;
        recurring[beat.slot]?.run(index);
        changed = true;
        continue;
      }
      if (head !== undefined && head.at <= now) {
        queue.shift();
        head.run();
        changed = true;
        if (status !== 'running') break;
        continue;
      }
      break;
    }
    if (status !== 'running') return;
    options.onTick?.(changed);
  };

  const start = (items: readonly ScheduledItem[], waitingItems: readonly WaitingItem[] = []): void => {
    if (status !== 'idle') return;
    startedMs = options.now();
    pausedAt = null;
    pausedTotal = 0;
    frozenMs = null;
    nextIndex = recurring.map(() => 1);
    queue = [...items].sort(byTime);
    waiting = [...waitingItems];
    setStatus('running');
    tick();
  };

  const pause = (): void => {
    if (status !== 'running') return;
    tick();
    if (status !== 'running') return;
    pausedAt = options.now();
    setStatus('paused');
  };

  const resume = (): void => {
    if (status !== 'paused' || pausedAt === null) return;
    pausedTotal += options.now() - pausedAt;
    pausedAt = null;
    setStatus('running');
    tick();
  };

  const reset = (): void => {
    pausedAt = null;
    pausedTotal = 0;
    frozenMs = null;
    queue = [];
    waiting = [];
    nextIndex = recurring.map(() => 1);
    setStatus('idle');
  };

  const schedule = (items: readonly ScheduledItem[]): void => {
    queue = [...queue, ...items].sort(byTime);
  };

  const signal = (name: string, key = ''): void => {
    if (status !== 'running' && status !== 'paused') return;
    const matched = waiting.filter((item) => item.when === name && (item.key === undefined || item.key === key));
    waiting = waiting.filter((item) => !matched.includes(item));
    for (const item of matched) item.run();
  };

  const finish = (atMs: number): void => {
    frozenMs = atMs;
    setStatus('ended');
  };

  return { status: () => status, elapsedMs, start, pause, resume, reset, tick, schedule, signal, finish };
};
