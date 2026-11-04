export const REHEARSAL_DATABASES: readonly string[];
export function deleteRehearsalD1(options: {
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
}): Promise<void>;
export function rehearsalFailureLines(error: unknown): string[];
export function request(options: {
  method: string;
  path: string;
  body?: unknown;
  token: string;
  signal?: AbortSignal;
  fetchRequest: typeof fetch;
}): Promise<{ result: unknown; success: boolean }>;
export function listDatabases(context: {
  accountId: string;
  token: string;
  signal?: AbortSignal;
  fetchRequest: typeof fetch;
}): Promise<unknown[]>;
export function matchesOf(items: unknown[], name: string): unknown[];
