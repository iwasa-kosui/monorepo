import type { TargetIdentity } from './fresh-target.mjs';
import type { ExpectedTarget } from './migration-target-contract.mjs';
import type { MigrationStorage } from './migration-bundle.mjs';
export function targetSetupConfiguration(
  env: Record<string, string | undefined>,
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
export function transferStorageFromEnvironment(
  env: Record<string, string | undefined>,
  identity: TargetIdentity,
  readOnly?: boolean,
  signal?: AbortSignal,
): MigrationStorage;
