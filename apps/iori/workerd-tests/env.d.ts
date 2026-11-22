/// <reference types="@cloudflare/vitest-plugin/types" />

import type { IoriWorkerEnv } from '../src/workerEnv.ts';

declare global {
  namespace Cloudflare {
    interface Env extends IoriWorkerEnv {
      TEST_MIGRATIONS: { name: string; queries: string[] }[];
      TEST_OG_FONT_BASE64: string;
    }
  }
}
