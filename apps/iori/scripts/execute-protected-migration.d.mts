import type { KeyObject } from 'node:crypto';
import type { ExpectedTarget, PreparationRecord } from './migration-target-contract.mjs';
import type { MigrationRehearsal } from './migration-budget.mjs';
import type { MigrationStorage } from './migration-bundle.mjs';
import type { MigrationObjectWriter } from './migration-r2-writer.mjs';
import type { createSourceSshAdapter } from './source-control-ssh.mjs';
import type { createCloudflareImportProvider } from './verify-cloudflare-import.mjs';
export type ExecutorOptions = {
  expectedTarget: ExpectedTarget;
  root: string;
  source: Awaited<ReturnType<typeof createSourceSshAdapter>>;
  storage: MigrationStorage;
  receiptPrivateKey: KeyObject;
  receiptPublicKey: KeyObject;
  rehearsal: MigrationRehearsal;
  bucket: MigrationObjectWriter;
  actualProvider: ReturnType<typeof createCloudflareImportProvider>;
  signal?: AbortSignal;
  maxSqlFileBytes?: number;
  availableBytes?(root: string): Promise<number | bigint>;
  readTarget(
    input: { expectedTarget: ExpectedTarget; record: PreparationRecord; signal: AbortSignal },
  ): Promise<unknown>;
  loadFont(signal: AbortSignal): Promise<ArrayBuffer>;
  render(input: { title: string; fontData: ArrayBuffer }): Promise<Uint8Array>;
  importD1(input: { expectedTarget: ExpectedTarget; manifestPath: string; signal: AbortSignal }): Promise<unknown>;
};
export function executionReservationKey(target: ExpectedTarget): string;
export function executeProtectedMigration(
  options: ExecutorOptions,
): Promise<{ status: 'published'; contractPath: string }>;
