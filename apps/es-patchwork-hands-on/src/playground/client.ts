import type { RunOutcome, SqlRunOutcome, WorkerRequest, WorkerResponse } from './engine/types.ts';

export const executionLimitMs = 5000;
export const loadingLimitMs = 20_000;

export type RuntimeState = 'loading' | 'ready' | 'failed';

export class RuntimeTimeoutError extends Error {
  constructor() {
    super(`実行に ${executionLimitMs / 1000} 秒以上かかったため、途中で止めました`);
    this.name = 'RuntimeTimeoutError';
  }
}

export class RuntimeScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeScriptError';
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
  setupSql: (setupSql: string) => Promise<string | null>;
  runSql: (sql: string) => Promise<SqlRunOutcome>;
  runCode: (files: Readonly<Record<string, string>>, entry: string) => Promise<RunOutcome>;
};

export const createRuntime = (
  onStateChange: (state: RuntimeState) => void,
  onRuntimeError: (message: string) => void,
): Runtime => {
  let worker: Worker | null = null;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let state: RuntimeState = 'loading';
  let generation = 0;
  let nextId = 0;
  const pending = new Map<number, Pending>();

  const setState = (next: RuntimeState): void => {
    state = next;
    onStateChange(next);
  };

  const rejectAll = (error: Error): void => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      pending.delete(id);
    }
  };

  const stop = (): void => {
    clearTimeout(loadTimer);
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
    loadTimer = setTimeout(() => {
      if (worker === created && state === 'loading') {
        stop();
        setState('failed');
      }
    }, loadingLimitMs);
    created.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      if (worker !== created) {
        return;
      }
      const response = event.data;
      if (response.type === 'ready') {
        clearTimeout(loadTimer);
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
    created.addEventListener('error', (event: ErrorEvent) => {
      if (worker !== created) {
        return;
      }
      event.preventDefault();
      if (state === 'loading') {
        stop();
        setState('failed');
        return;
      }
      const message = event.message === '' ? 'エラーの内容を取得できませんでした' : event.message;
      const waiting = pending.size > 0;
      rejectAll(new RuntimeScriptError(message));
      if (!waiting) {
        onRuntimeError(message);
      }
      start();
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
    setupSql: async (setupSql) => (await request({ type: 'sql-setup', setupSql })).error,
    runSql: async (sql) => (await request({ type: 'sql-run', sql })).outcome,
    runCode: async (files, entry) => (await request({ type: 'code-run', files, entry })).outcome,
  };
};
