export const RELAY_ACTOR_URI: string;
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
