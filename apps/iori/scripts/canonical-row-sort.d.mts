export function canonicalRowSummary(
  rows: AsyncIterable<string> | Iterable<string>,
  options?: { chunkBytes?: number; spoolParent?: string; signal?: AbortSignal },
): Promise<{ count: number; checksum: string }>;

export function sortedCanonicalRecords(
  rows: AsyncIterable<{ key: string; payload: string }> | Iterable<{ key: string; payload: string }>,
  options?: { chunkBytes?: number; spoolParent?: string; signal?: AbortSignal },
): AsyncGenerator<{ key: string; payload: string }>;
