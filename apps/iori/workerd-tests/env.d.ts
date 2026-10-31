/// <reference types="@cloudflare/vitest-pool-workers" />

import type { IoriWorkerEnv } from '../src/workerEnv.ts';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends IoriWorkerEnv {
    TEST_MIGRATIONS: { name: string; queries: string[] }[];
    TEST_OG_FONT_BASE64: string;
  }
}
