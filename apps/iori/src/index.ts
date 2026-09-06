import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { Client } from 'pg';
import { behindProxy } from 'x-forwarded-fetch';

import { listenControlSocket } from './adaptor/node/source/controlSocket.ts';
import { defaultControlBase, SourceControl } from './adaptor/node/source/sourceControl.ts';
import { SourceSnapshot } from './adaptor/node/source/sourceSnapshot.ts';
import { PgConfig } from './adaptor/pg/pgConfig.ts';
import app from './app.tsx';
import { Env } from './env.ts';
import { Federation } from './federation.ts';

declare const __IORI_SOURCE_REVISION__: string | undefined;
const revision = typeof __IORI_SOURCE_REVISION__ === 'undefined' ? undefined : __IORI_SOURCE_REVISION__;
const sourceBase = defaultControlBase();
const sourceSnapshot = new SourceSnapshot({
  base: sourceBase,
  uploadDir: process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'),
  createClient: async () =>
    new Client({
      connectionString: Env.getInstance().DATABASE_URL,
      ...PgConfig.getInstance(),
      connectionTimeoutMillis: 10_000,
    }),
});
const source = await SourceControl.open({ queue: Federation.getQueue(), revision, snapshot: sourceSnapshot });
const controlSocket = await listenControlSocket(source);
const queueAbort = new AbortController();
// Start exactly once; the controlled loop pauses/resumes without restarting Fedify.
const queueRunning = Federation.getInstance().startQueue(undefined, { signal: queueAbort.signal }).catch(() => {
  Federation.getQueue().pause();
});

import './logging.ts';

const server = serve(
  {
    port: 8000,
    fetch: (request) => source.fetch(() => behindProxy(app.fetch.bind(app))(request)),
  },
  (info) => console.log('Server started at http://' + info.address + ':' + info.port),
);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  Federation.getQueue().pause();
  queueAbort.abort();
  // Close ingress and await accepted HTTP and the queue transaction before exiting.
  const results = await Promise.allSettled([
    source.stop(),
    new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    controlSocket.close(),
    queueRunning,
  ]);
  process.exit(results.some((result) => result.status === 'rejected') ? 1 : 0);
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

export default app;
