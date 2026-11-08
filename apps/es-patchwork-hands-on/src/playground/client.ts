import type { RunOutcome, SqlRunOutcome, WorkerRequest, WorkerResponse } from './engine/types.ts';

export const executionLimitMs = 5000;

export type RuntimeState = 'loading' | 'ready' | 'failed';

export class RuntimeTimeoutError extends Error {
  constructor() {
    super(`実行に ${executionLimitMs / 1000} 秒以上かかったため、途中で止めました`);
    this.name = 'RuntimeTimeoutError';
  }
}

type RequestBody<T extends WorkerRequest['type']> = Omit<Extract<WorkerRequest, { type: T }>, 'id'>;

type Pending = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type Runtime = {
  readonly state: RuntimeState;
  readonly generation: number;
  reload: () => void;
  whenReady: () => Promise<void>;
  setupSql: (setupSql: string) => Promise<string | null>;
  setupScript: (files: Readonly<Record<string, string>>, entry: string) => Promise<string | null>;
  runSql: (sql: string) => Promise<SqlRunOutcome>;
  runCode: (files: Readonly<Record<string, string>>, entry: string) => Promise<RunOutcome>;
};

export const createRuntime = (onStateChange: (state: RuntimeState) => void): Runtime => {
  let worker: Worker | null = null;
  let state: RuntimeState = 'loading';
  let generation = 0;
  let nextId = 0;
  const pending = new Map<number, Pending>();
  let waiters: { resolve: () => void; reject: (error: Error) => void }[] = [];

  const setState = (next: RuntimeState): void => {
    state = next;
    onStateChange(next);
    if (next !== 'loading') {
      const settled = waiters;
      waiters = [];
      for (const waiter of settled) {
        if (next === 'ready') {
          waiter.resolve();
        } else {
          waiter.reject(new Error('実行環境を読み込めませんでした'));
        }
      }
    }
  };

  const rejectAll = (message: string): void => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
      pending.delete(id);
    }
  };

  const stop = (): void => {
    worker?.terminate();
    worker = null;
  };

  const start = (): void => {
    stop();
    generation += 1;
    setState('loading');
    const created = (() => {
      try {
        return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      } catch {
        return null;
      }
    })();
    if (created === null) {
      setState('failed');
      return;
    }
    worker = created;
    created.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      if (worker !== created) {
        return;
      }
      const response = event.data;
      if (response.type === 'ready') {
        setState('ready');
        return;
      }
      if (response.type === 'init-error') {
        stop();
        setState('failed');
        return;
      }
      const entry = pending.get(response.id);
      if (entry !== undefined) {
        clearTimeout(entry.timer);
        pending.delete(response.id);
        if (response.type === 'failure') {
          entry.reject(new Error(response.message));
        } else {
          entry.resolve(response);
        }
      }
    });
    created.addEventListener('error', () => {
      if (worker !== created) {
        return;
      }
      stop();
      rejectAll('実行環境が止まりました');
      setState('failed');
    });
  };

  const request = <T extends WorkerRequest['type']>(
    body: RequestBody<T> & { type: T },
  ): Promise<Extract<WorkerResponse, { type: T }>> =>
    new Promise((resolve, reject) => {
      if (worker === null || state !== 'ready') {
        reject(new Error('実行環境がまだ使えません'));
        return;
      }
      nextId += 1;
      const id = nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new RuntimeTimeoutError());
        start();
      }, executionLimitMs);
      pending.set(id, {
        resolve: (response) => resolve(response as Extract<WorkerResponse, { type: T }>),
        reject,
        timer,
      });
      worker.postMessage({ ...body, id });
    });

  start();

  return {
    get state() {
      return state;
    },
    get generation() {
      return generation;
    },
    reload: start,
    whenReady: () =>
      new Promise<void>((resolve, reject) => {
        if (state === 'ready') {
          resolve();
        } else if (state === 'failed') {
          reject(new Error('実行環境を読み込めませんでした'));
        } else {
          waiters.push({ resolve, reject });
        }
      }),
    setupSql: async (setupSql) => (await request({ type: 'sql-setup', setupSql })).error,
    setupScript: async (files, entry) => (await request({ type: 'sql-setup-script', files, entry })).error,
    runSql: async (sql) => (await request({ type: 'sql-run', sql })).outcome,
    runCode: async (files, entry) => (await request({ type: 'code-run', files, entry })).outcome,
  };
};
