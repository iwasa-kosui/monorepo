export const CUTOVER_STAGES: readonly string[];
export function isCutoverReason(reason: unknown): boolean;
export function cutoverFailureLines(stage: unknown, error: unknown, aborted: boolean): string[];
