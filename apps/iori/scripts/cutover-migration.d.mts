export function cutoverMigration(
  input: { env: Record<string, string | undefined>; startedAt: number; signal: AbortSignal },
  dependencies?: { onStage?: (stage: string) => void },
): Promise<{ activated: true }>;
