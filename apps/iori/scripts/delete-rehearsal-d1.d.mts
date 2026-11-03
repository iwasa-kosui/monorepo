export const REHEARSAL_DATABASES: readonly string[];
export function deleteRehearsalD1(options: {
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
}): Promise<void>;
export function rehearsalFailureLines(error: unknown): string[];
