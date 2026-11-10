import type { SourceSshOptions } from './source-control-ssh.mjs';
export function diagnoseSource(
  options: Omit<SourceSshOptions, 'mainSha' | 'runId'>,
  dependencies?: {
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
  },
): Promise<void>;
