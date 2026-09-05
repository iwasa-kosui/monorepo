export function canonicalRowSummary(
  rows: AsyncIterable<string> | Iterable<string>,
  options?: { chunkBytes?: number },
): Promise<{ count: number; checksum: string }>;
