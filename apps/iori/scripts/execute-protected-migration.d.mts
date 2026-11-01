import type { KeyObject } from 'node:crypto';

import type { MigrationEstimate, MigrationRehearsal } from './migration-budget.mjs';
import type { MigrationStorage } from './migration-bundle.mjs';
import type { MigrationObjectWriter } from './migration-r2-writer.mjs';
import type { ExpectedTarget, PreparationRecord } from './migration-target-contract.mjs';
import type { createSourceSshAdapter } from './source-control-ssh.mjs';
import type { createCloudflareImportProvider } from './verify-cloudflare-import.mjs';
export type ExecutorOptions = {
  expectedTarget: ExpectedTarget;
  root: string;
  source: Awaited<ReturnType<typeof createSourceSshAdapter>>;
  storage: MigrationStorage & { getIfExists(key: string, limit: number): Promise<Buffer | null> };
  receiptPrivateKey: KeyObject;
  receiptPublicKey: KeyObject;
  rehearsal: MigrationRehearsal;
  bucket: MigrationObjectWriter;
  actualProvider: ReturnType<typeof createCloudflareImportProvider>;
  apiToken: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  deadlineMs?: number;
  maxSqlFileBytes?: number;
  availableBytes?(root: string): Promise<number | bigint>;
  readTarget(
    input: { expectedTarget: ExpectedTarget; record: PreparationRecord; signal: AbortSignal },
  ): Promise<unknown>;
  loadFont(signal: AbortSignal): Promise<ArrayBuffer>;
  render(input: { title: string; fontData: ArrayBuffer }): Promise<Uint8Array>;
  importD1(input: { expectedTarget: ExpectedTarget; manifestPath: string; signal: AbortSignal }): Promise<unknown>;
};
export type ExecutorPhaseName =
  | 'prepare-target-resources'
  | 'drain-queue'
  | 'export-postgres'
  | 'convert-and-import-d1'
  | 'import-r2-and-ogp'
  | 'verify-import';
export type ExecutorPlan<TResult> = {
  budget(input: { estimate: MigrationEstimate; availableBytes: number | bigint; remainingMs: number }): void;
  beforeReservation?(): Promise<void>;
  beforeFreeze?(): void;
  freezeLimitMs?: number;
  afterExport?(): Promise<unknown> | undefined;
  finish(
    context: {
      contract: unknown;
      writeJson(reference: string, value: unknown): Promise<string>;
      signal: AbortSignal;
      estimate: MigrationEstimate;
      elapsed: Partial<Record<ExecutorPhaseName, number>>;
    },
  ): Promise<TResult>;
};
export function assertSigner(privateKey: KeyObject, publicKey: KeyObject): void;
export function runProtectedPhases<TResult>(
  options: Omit<ExecutorOptions, 'rehearsal'>,
  target: ExpectedTarget,
  plan: ExecutorPlan<TResult>,
): Promise<TResult>;
export function runExecutorCli(
  cliSignal: AbortSignal,
  options: { run(options: never): Promise<unknown>; withRehearsal: boolean },
): Promise<void>;
export function executionReservationKey(target: ExpectedTarget): string;
export function executeProtectedMigration(
  options: ExecutorOptions,
): Promise<{ status: 'published'; contractPath: string }>;
