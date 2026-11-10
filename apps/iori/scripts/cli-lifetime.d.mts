export function withCliSignal<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T>;
