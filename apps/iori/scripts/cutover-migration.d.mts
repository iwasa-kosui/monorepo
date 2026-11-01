export function cutoverMigration(
  input: { env: Record<string, string | undefined>; startedAt: number; signal: AbortSignal },
  dependencies?: {
    onStage?: (stage: string) => void;
    sleep?: (ms: number, signal: AbortSignal) => Promise<unknown>;
    report?: (line: string) => void;
    now?: () => number;
  },
): Promise<{ activated: true }>;
