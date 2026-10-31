import type { SourceState } from './source-control-ssh.mjs';
export function createStageRunner(): {
  current: { program: string; stderr: string };
  stage<T>(name: string, operation: () => Promise<T>): Promise<T>;
};
export function readSourceStatus(
  source: { status(signal?: AbortSignal): Promise<SourceState> },
  signal: AbortSignal,
  retry: { timeoutMs: number; intervalMs: number },
): Promise<SourceState>;
