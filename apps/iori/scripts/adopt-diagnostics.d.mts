export const ADOPT_STAGES: readonly string[];
export const ADOPT_RESULT_WORDS: Readonly<Record<string, readonly string[]>>;
export function adoptFailureLines(stage: unknown, error: unknown, aborted: boolean): string[];
export function adoptResultLine(stage: unknown, word: unknown): string;
