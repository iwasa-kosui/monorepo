export function readMigrationTarget(
  env: Record<string, string | undefined>,
  signal: AbortSignal,
  onStage?: (stage: string) => void,
): Promise<unknown>;
