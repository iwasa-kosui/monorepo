import type { ExpectedTarget } from './migration-target-contract.mjs';
export const reviewedD1Schema: string;
export function importMigrationD1(
  input: {
    expectedTarget: ExpectedTarget;
    manifestPath: string;
    apiToken: string;
    signal?: AbortSignal;
    fetchRequest?: typeof fetch;
    runCommand?: (program: string, args: string[], options: object) => Promise<{ stdout: string; stderr: string }>;
  },
): Promise<{ fileCount: number }>;
