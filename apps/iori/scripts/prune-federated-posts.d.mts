export const RETENTION_MS: number;
export const REASONS: Readonly<Record<string, string>>;
export function cutoffOf(now: number): number;
export function candidateSql(cutoffMs: number): string;
export function dryRunSql(cutoffMs: number): string;
export function pruneFederatedPosts(options: {
  env: Record<string, string | undefined>;
  mode: 'dry-run';
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
  now?: number;
}): Promise<void>;
export function pruneFailureLines(error: unknown): string[];
