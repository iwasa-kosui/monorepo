import type { InfrastructureCommand } from './infrastructure-command.mjs';
import type { TargetIdentity } from './fresh-target.mjs';
import type { TargetResourceReadback } from './target-control-plane.mjs';
export function transitionWorkerAdmission(
  input: {
    identity: TargetIdentity;
    resources: TargetResourceReadback;
    token: string;
    admissionEnvironment: Record<string, string>;
    zoneId: string;
    expectedVersionId: string;
    mode: 'sealed' | 'smoke' | 'active';
    routePresent?: boolean;
    fetchRequest?: (url: URL, init: RequestInit) => Promise<Response>;
    runCommand?: InfrastructureCommand;
    signal?: AbortSignal;
  },
): Promise<
  {
    versionId: string;
    workerName: string;
    mode: string;
    previewsEnabled: false;
    routeCount: number;
    bindingCount: number;
  }
>;
