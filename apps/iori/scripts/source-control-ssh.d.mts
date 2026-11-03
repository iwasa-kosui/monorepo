import type { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';
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
  status(signal?: AbortSignal): Promise<SourceState>;
  resume(
    recovery: 'destination_writes_not_enabled' | 'destination_writes_reconciled',
    signal?: AbortSignal,
  ): Promise<SourceState>;
}>;
