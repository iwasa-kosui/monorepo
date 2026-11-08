export function targetCondition(beforeMs: number): string;
export function dryRunSql(beforeMs: number): string;
export function applySql(options: { beforeMs: number; now: number }): string[];
export function applyCountSql(now: number): string;
export function deleteUnfollowedPosts(options: {
  env: Record<string, string | undefined>;
  mode: 'dry-run' | 'apply';
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
  now?: number;
}): Promise<void>;
export function deleteFailureLines(error: unknown): string[];
