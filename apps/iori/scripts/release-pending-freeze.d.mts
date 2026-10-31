import type { SourceSshOptions, SourceState } from './source-control-ssh.mjs';
export function releasePendingFreeze(options: SourceSshOptions, dependencies?: {
  signal?: AbortSignal;
  runCommand?: (
    program: string,
    args: string[],
    options: {
      input?: string;
      signal?: AbortSignal;
      captureOutput?: (output: { stdout: string; stderr: string }) => Promise<void>;
    },
  ) => Promise<{ stdout: string; stderr: string }>;
  sourceFactory?: (options: SourceSshOptions) => Promise<{ status(signal?: AbortSignal): Promise<SourceState> }>;
  statusRetryTimeoutMs?: number;
  statusRetryIntervalMs?: number;
}): Promise<void>;
