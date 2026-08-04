import type { D1Database, Fetcher, KVNamespace, Queue, R2Bucket } from '@cloudflare/workers-types';

export type IoriWorkerEnv = Readonly<{
  DB: D1Database;
  UPLOADS: R2Bucket;
  FEDIFY_KV: KVNamespace;
  FEDIFY_QUEUE: Queue;
  ASSETS?: Fetcher;
  ORIGIN: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT: string;
}>;
