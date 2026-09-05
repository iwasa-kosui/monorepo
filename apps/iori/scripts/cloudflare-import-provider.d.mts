import type { ExpectedTarget } from './migration-target-contract.mjs';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
export type ImportTransport = {
  getTableSummaries(tables: readonly string[]): Promise<Record<string, { count: number; checksum: string }>>;
  getObject(key: string): Promise<{ body: ReadableStream<Uint8Array>; httpMetadata: { contentType: string } } | null>;
  listObjects(prefix: string, cursor?: string): Promise<{ keys: string[]; cursor?: string }>;
};
export type ImportTransportOptions = {
  expectedTarget?: ExpectedTarget;
  fetchImpl?: typeof fetch;
  createClient?: (config: S3ClientConfig) => { send(command: unknown, options?: unknown): Promise<unknown> };
  pageSize?: number;
  sortChunkBytes?: number;
};
export function createCloudflareImportTransport(
  options: ImportTransportOptions & {
    bindings: Record<string, unknown>;
    expectedWorkerName: string;
    accountId: string;
    apiToken: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
): ImportTransport;
export function createCloudflareImportTransportFromEnvironment(
  environment: Record<string, string | undefined>,
  options?: ImportTransportOptions,
): Promise<ImportTransport>;
