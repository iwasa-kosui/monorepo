import type { ExecutionContext } from '@cloudflare/workers-types';
import { Hono } from 'hono';

import worker from './worker.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const executionContext: ExecutionContext = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
  props: undefined,
} as ExecutionContext;

/**
 * Creates an app bound to one Worker environment.  The Worker runtime itself
 * is created by the request handler, keeping D1/KV/queue state out of module
 * scope and safe for concurrent isolates.
 */
export const createWorkerApp = (env: IoriWorkerEnv): Hono => {
  const app = new Hono();

  app.all('*', async (c) => worker.fetch(c.req.raw, env, executionContext));

  return app;
};
