import type { MigrationStorage } from './migration-bundle.mjs';
import type { ExpectedTarget, PreparationRecord } from './migration-target-contract.mjs';
export function readPreparationRecord(
  input: { storage: MigrationStorage; expectedTarget: ExpectedTarget },
): Promise<{ record: PreparationRecord; sha256: string }>;
export function writePreparationRecord(
  input: { storage: MigrationStorage; expectedTarget: ExpectedTarget; record: PreparationRecord },
): Promise<{ record: PreparationRecord; sha256: string }>;
