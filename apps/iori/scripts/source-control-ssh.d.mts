import type { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';
import type { SourceInventory } from './source-transfer-protocol.mjs';
export type SourceSshOptions = {
  host: string;
  user: string;
  mainSha: string;
  runId: string;
  identityFile: string;
  knownHostsFile: string;
};
export type SourceState = {
  source_revision: string;
  ingress_frozen: boolean;
  http_inflight: number;
  queue_depth: number;
  dequeue_work: number;
  enqueue_work: number;
  consumer_paused: boolean;
  queue_failed: boolean;
  drained: boolean;
  identity: { main_sha: string; run_id: string } | null;
};
export function createSourceSshAdapter(options: SourceSshOptions, testOptions?: {
  spawnProcess?: (
    program: string,
    args: string[],
    options: { stdio: string[]; shell: boolean },
  ) => Pick<EventEmitter, 'once'> & { kill(signal?: NodeJS.Signals): boolean } & { stdout: Readable; stderr: Readable };
}): Promise<{
  estimate(
    signal?: AbortSignal,
  ): Promise<
    {
      source_revision: string;
      table_bytes: number;
      upload_bytes: number;
      rows: number;
      upload_count: number;
      article_count: number;
      source_free_bytes: number;
      source_required_bytes: number;
      runner_required_bytes: number;
      source_sufficient: boolean;
      limits: typeof import('./source-transfer-protocol.mjs').SOURCE_LIMITS;
    }
  >;
  freeze(signal?: AbortSignal): Promise<SourceState>;
  status(signal?: AbortSignal): Promise<SourceState>;
  drain(timeoutMs?: number, signal?: AbortSignal): Promise<SourceState>;
  export(signal?: AbortSignal): Promise<SourceInventory>;
  restore(
    outputDir: string,
    signal?: AbortSignal,
  ): Promise<{ root: string; manifestPath: string; uploadDir: string; inventoryPath: string }>;
}>;
