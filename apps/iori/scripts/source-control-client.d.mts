import type { Writable } from 'node:stream';
export function sourceCommandArguments(
  args: string[],
): { op: string; main_sha: string; run_id: string; timeout_ms?: number; recovery?: string; file_id?: string };
export function requestSourceControl(
  input: { args: string[]; output: Writable; base?: string; signal?: AbortSignal },
): Promise<void>;
