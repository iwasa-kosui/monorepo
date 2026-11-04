export const ARCHIVE_AGE_MS: number;
export function summarySql(now: number): string;
export function dailySql(now: number): string;
export function eventNameSql(): string;
export function statsStatements(now: number): string[];
export type DomainEventsStats = {
  generatedAt: string;
  total: number;
  oldestOccurredAt: string | null;
  newestOccurredAt: string | null;
  olderThanArchiveAge: { days: number; cutoffOccurredAt: string; count: number };
  dailyCounts: Array<{ day: string; count: number }>;
  eventNameCounts: Array<{ eventName: string; count: number }>;
  rowBytes: { average: number | null; max: number | null };
  createdAtSkewActors: number;
};
export function buildStats(options: { results: unknown; now: number }): DomainEventsStats;
export function noticeLines(stats: DomainEventsStats): string[];
export function domainEventsStats(options: {
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
  output?: (text: string) => void;
  now?: number;
}): Promise<void>;
export function statsFailureLines(error: unknown): string[];
