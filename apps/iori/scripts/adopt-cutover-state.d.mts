export function adoptCutoverState(
  input: { env: Record<string, string | undefined>; startedAt: number; signal: AbortSignal },
  dependencies?: {
    setup?: (...args: never[]) => unknown;
    checkMain?: (...args: never[]) => unknown;
    terraformFactory?: (...args: never[]) => unknown;
    controlFactory?: (...args: never[]) => unknown;
    onStage?: (stage: string) => void;
    report?: (line: string) => void;
  },
): Promise<{ adopted: true }>;
