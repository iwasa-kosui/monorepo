import type { ActiveExpectedTarget } from './migration-target-contract.mjs';
import type { InfrastructureCommand } from './infrastructure-command.mjs';
export function updateActiveWorker(
  input: {
    expectedTarget: ActiveExpectedTarget;
    currentCodeSha: string;
    token: string;
    zoneId: string;
    signal: AbortSignal;
    fetchRequest?: (url: URL, init: RequestInit) => Promise<Response>;
    runCommand?: InfrastructureCommand;
    onStage?: (stage: string) => void;
    checkMain?: (sha: string, options: { signal: AbortSignal }) => Promise<void>;
  },
): Promise<{ currentCodeSha: string; migrationMainSha: string; previousVersion: string; versionId: string }>;
