import type { ExpectedTarget } from './migration-target-contract.mjs';
import type { KeyObject } from 'node:crypto';
export type MigrationStorage = {
  assertPrivate(): Promise<void>;
  putNew(key: string, body: Buffer): Promise<void>;
  get(key: string, limit: number): Promise<Buffer>;
};
export type MigrationBundleOptions = {
  expectedTarget: ExpectedTarget;
  environment: 'production' | 'staging';
  expectedMainSha: string;
  expectedRunId: string;
  root: string;
  /** Strict root-relative reference, preserved without rewriting. */
  contractPath: string;
  receiptPublicKey: KeyObject;
  storage: MigrationStorage;
  chunkSize?: number;
  availableBytes?: (root: string) => Promise<number | bigint>;
};
export function publishMigrationBundle(
  options: MigrationBundleOptions,
): Promise<{ status: 'published'; fileCount: number }>;
export function restoreMigrationBundle(
  options: MigrationBundleOptions,
): Promise<{ status: 'restored'; fileCount: number }>;
