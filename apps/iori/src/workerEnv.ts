import type { Ai, D1Database, Fetcher, KVNamespace, Queue, R2Bucket } from '@cloudflare/workers-types';

export type IoriWorkerEnv = Readonly<{
  DB: D1Database;
  UPLOADS: R2Bucket;
  EVENT_ARCHIVE?: R2Bucket;
  EVENT_ARCHIVE_ENABLED?: string;
  FEDIFY_KV: KVNamespace;
  FEDIFY_QUEUE: Queue;
  ASSETS?: Fetcher;
  AI?: Ai;
  ORIGIN: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT: string;
  TWITTERAPI_IO_API_KEY?: string;
  SMOKE_QUEUE_TOKEN?: string;
  STAGING_ACCESS_TOKEN?: string;
  IORI_ADMISSION_MODE?: string;
  IORI_ADMISSION_IDENTITY?: string;
  IORI_PRUNE_FEDERATED_POSTS?: string;
  IORI_BLUESKY_CROSSPOST?: string;
  IORI_BLUESKY_TIMELINE?: string;
  IORI_AI_AGENT_BOT?: string;
  BLUESKY_IDENTIFIER?: string;
  BLUESKY_APP_PASSWORD?: string;
  BLUESKY_CREDENTIAL_KEY?: string;
}>;
