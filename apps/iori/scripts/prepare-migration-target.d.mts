import type { ExpectedTarget, PreparationRecord } from './migration-target-contract.mjs';
import type { TargetIdentity } from './fresh-target.mjs';
import type { MigrationStorage } from './migration-bundle.mjs';
type Outputs = {
  workerBindings: Record<string, string>;
  targetIdentity: Record<string, unknown>;
  migrationStorage: Record<string, string>;
};
export function prepareMigrationTarget(input: {
  config: {
    identity: TargetIdentity;
    mainSha: string;
    runId: string;
    admission: ExpectedTarget['admission'];
    admissionEnvironment: Record<string, string>;
    zoneId: string;
  };
  preparation: {
    prepareResources(): Promise<Outputs>;
    attachSealedConsumer(
      input: { admissionEnvironment: Record<string, string>; zoneId: string; expectedVersionId: string },
    ): Promise<
      Outputs & { resources: { consumerId: string | null; queuePaused: boolean }; worker: Record<string, unknown> }
    >;
  };
  deploy(bindings: Record<string, string>): Promise<{ workerName: string; versionId: string }>;
  storage: MigrationStorage;
}): Promise<{ record: PreparationRecord; sha256: string }>;
