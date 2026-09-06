import type { ExpectedTarget } from './migration-target-contract.mjs';
import type { MigrationStorage } from './migration-bundle.mjs';
import type { InfrastructureCommand } from './infrastructure-command.mjs';
export function updateActiveWorker(
  input: {
    expectedTarget: ExpectedTarget;
    currentCodeSha: string;
    storage: MigrationStorage;
    token: string;
    zoneId: string;
    signal: AbortSignal;
    fetchRequest?: (url: URL, init: RequestInit) => Promise<Response>;
    runCommand?: InfrastructureCommand;
    checkMain?: (sha: string, options: { signal: AbortSignal }) => Promise<void>;
  },
): Promise<{ currentCodeSha: string; migrationMainSha: string; previousVersion: string; versionId: string }>;
