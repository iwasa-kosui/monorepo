import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type { ExpectedTarget } from './migration-target-contract.mjs';
import type { MigrationStorage } from './migration-bundle.mjs';
export type PurgeOptions = {
  expectedTarget: ExpectedTarget;
  storage: MigrationStorage & { getIfExists(key: string, limit: number): Promise<Buffer | null> };
  apiToken: string;
  accessKeyId: string;
  secretAccessKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  queryD1?(sql: string): Promise<unknown[]>;
  createClient?: (config: S3ClientConfig) => { send(command: unknown, options?: unknown): Promise<unknown> };
};
export function purgeRehearsalTarget(options: PurgeOptions): Promise<void>;
export function purgeFromEnvironment(
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  deps?: { purge?: (options: PurgeOptions) => Promise<void> },
): Promise<void>;
