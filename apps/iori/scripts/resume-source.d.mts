import type { SourceSshOptions, SourceState } from './source-control-ssh.mjs';
export function resumeSource(options: SourceSshOptions & { recovery: string }, dependencies?: {
  signal?: AbortSignal;
  sourceFactory?: (options: SourceSshOptions) => Promise<{
    status(signal?: AbortSignal): Promise<SourceState>;
    resume(recovery: string, signal?: AbortSignal): Promise<SourceState>;
  }>;
  statusRetryTimeoutMs?: number;
  statusRetryIntervalMs?: number;
}): Promise<void>;
