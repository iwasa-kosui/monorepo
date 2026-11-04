export function parseWorkflowInvocation(
  env: Record<string, string | undefined>,
  options?: { deferIdentity?: boolean; now?: number },
): Readonly<{
  operation: string;
  codeSha: string;
  migrationSha: string;
  environment: string;
  generation: string;
  runId: string;
}>;
export function workflowTimeBudget(startedAt: number, now?: number): { remainingMs: number; verificationMs: number };
export function createWorkflowDirectory(
  runnerTemp: string,
): Promise<Record<'base' | 'keys' | 'config' | 'logs' | 'tmp', string>>;
export function writePrivateValue(directory: string, name: string, value: string): Promise<string>;
export function repostCreatedBefore(value: unknown, now?: number): number | undefined;
