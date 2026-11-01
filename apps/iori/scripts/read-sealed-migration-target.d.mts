import type { ExpectedTarget } from './migration-target-contract.mjs';
export function readSealedMigrationTarget(
  input: {
    expectedTarget: ExpectedTarget;
    record: unknown;
    token: string;
    zoneId: string;
    fetchRequest?: (url: URL, init: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
  },
): Promise<{ resources: unknown; worker: unknown }>;
