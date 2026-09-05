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
    runCommand?: (
      command: string,
      args: string[],
      options: object,
    ) => { status: number | null; stdout?: string; stderr?: string };
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
