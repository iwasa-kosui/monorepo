export function ensureEventArchiveBucket(options: {
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
}): Promise<void>;
export function ensureFailureLines(error: unknown): string[];
