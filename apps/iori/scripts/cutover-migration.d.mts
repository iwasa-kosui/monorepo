export function cutoverMigration(
  input: { env: Record<string, string | undefined>; startedAt: number; signal: AbortSignal },
): Promise<{ activated: true }>;
