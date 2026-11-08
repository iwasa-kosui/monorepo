import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';

import { runCode } from './engine/run-code.ts';
import { createSqlSession } from './engine/sql-session.ts';
import type { WorkerRequest, WorkerResponse } from './engine/types.ts';

type Scope = {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const scope = self as unknown as Scope;

const loading = initSqlJs({ locateFile: () => wasmUrl });

loading.then(
  () => scope.postMessage({ type: 'ready' }),
  (error: unknown) =>
    scope.postMessage({ type: 'init-error', message: error instanceof Error ? error.message : String(error) }),
);

const handle = async (request: WorkerRequest): Promise<WorkerResponse> => {
  const SQL = await loading;
  switch (request.type) {
    case 'sql-setup':
      return { id: request.id, type: 'sql-setup', error: session(SQL).reset(request.setupSql) };
    case 'sql-run':
      return { id: request.id, type: 'sql-run', outcome: session(SQL).run(request.sql) };
    case 'code-run':
      return {
        id: request.id,
        type: 'code-run',
        outcome: await runCode({ SQL, files: request.files, entry: request.entry }),
      };
  }
};

let current: ReturnType<typeof createSqlSession> | undefined;
const session = (SQL: Awaited<typeof loading>): ReturnType<typeof createSqlSession> => {
  current ??= createSqlSession(SQL);
  return current;
};

self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  self.reportError(event.reason);
});

scope.onmessage = (event) => {
  handle(event.data).then(
    (response) => scope.postMessage(response),
    (error: unknown) =>
      scope.postMessage({
        id: event.data.id,
        type: 'failure',
        message: error instanceof Error ? error.message : String(error),
      }),
  );
};
