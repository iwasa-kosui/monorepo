import type { TargetIdentity } from './fresh-target.mjs';
import type { ExpectedTarget } from './migration-target-contract.mjs';
export function targetSetupConfiguration(
  env: Record<string, string | undefined>,
  options?: { backend?: boolean },
): {
  identity: TargetIdentity;
  mainSha: string;
  runId: string;
  zoneId: string;
  admission: ExpectedTarget['admission'];
  admissionEnvironment: Record<string, string>;
  backendEndpoint: string;
  hostname: string;
  token: string;
};
