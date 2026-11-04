export const TARGET_DOMAIN: string;
export function hostMatches(uri: string): string;
export function targetActorCondition(alias: string): string;
export function targetPostCondition(alias: string): string;
export function dryRunSql(): string;
export function applySql(options: { now: number }): string[];
export function applyCountSql(now: number): string;
export function deleteBlockedDomainPosts(options: {
  env: Record<string, string | undefined>;
  mode: 'dry-run' | 'apply';
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
  now?: number;
}): Promise<void>;
export function deleteFailureLines(error: unknown): string[];
