export function restoreAndVerifyMigration(
  input: { env: Record<string, string | undefined>; signal: AbortSignal },
): Promise<{ target: unknown; record: unknown; [key: string]: unknown }>;
