export const RELAY_ACTOR_URI: string;
export const GENERATION: RegExp;
export function fail(stage: string, reason: string, message: string): Error & { stage: string };
export function openD1Query(options: {
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  prefix: string;
}): Promise<{ query: (stage: string, sql: string) => Promise<Array<{ results?: Array<Record<string, unknown>> }>> }>;
export function targetCondition(beforeMs: number): string;
export function relaySql(): string;
export function dryRunSql(beforeMs: number): string;
export function applySql(options: { relayId: string; beforeMs: number; now: number }): string[];
export function applyCountSql(now: number): string;
export function moveUnfollowedReposts(options: {
  env: Record<string, string | undefined>;
  mode: 'dry-run' | 'apply';
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
  now?: number;
}): Promise<void>;
export function moveFailureLines(error: unknown): string[];
