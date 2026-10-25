export function materializeHostedValues(
  env: Record<string, string | undefined>,
): Promise<Record<string, string | undefined>>;
export function initializeHostedWorkflow(env: Record<string, string | undefined>): Promise<Record<string, string>>;
export function runHostedWorkflow(
  phase: string,
  env: Record<string, string | undefined>,
  signal: AbortSignal,
): Promise<void>;
