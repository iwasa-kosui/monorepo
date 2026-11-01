export const CUTOVER_STAGES: readonly string[];
export function isCutoverReason(reason: unknown): boolean;
export function cutoverFailureLines(stage: unknown, error: unknown, aborted: boolean): string[];
export const PROBE_STAGES: readonly string[];
export function probeFailureLines(stage: unknown, error: unknown, aborted: boolean): string[];
export class ProbeRestoreFailure extends Error {
  constructor(failure: unknown, failedStage: string, restoreFailure: unknown);
  readonly failure: unknown;
  readonly failedStage: string;
  readonly restoreFailure: unknown;
}
