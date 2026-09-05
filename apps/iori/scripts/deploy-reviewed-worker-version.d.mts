import type { TargetIdentity } from './fresh-target.mjs';
import type { InfrastructureCommand } from './infrastructure-command.mjs';
export function deployReviewedWorkerVersion(
  input: {
    identity: TargetIdentity;
    resources: { d1Id: string; kvId: string };
    admissionEnvironment: Record<string, string>;
    mode: 'sealed' | 'smoke' | 'active';
    signal: AbortSignal;
    runCommand?: InfrastructureCommand;
  },
): Promise<string>;
