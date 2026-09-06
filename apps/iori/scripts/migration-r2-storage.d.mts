import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type { MigrationStorage } from './migration-bundle.mjs';
export function readBoundedObject(body: Buffer | AsyncIterable<Uint8Array>, limit: number): Promise<Buffer>;
export type PrivacyOptions = {
  accountId: string;
  bucket: string;
  apiToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};
export function assertMigrationBucketPrivate(options: PrivacyOptions): Promise<void>;
export function createMigrationR2Storage(options: {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  apiToken?: string;
  readOnly?: boolean;
  signal?: AbortSignal;
  createClient?: (
    config: S3ClientConfig,
  ) => {
    send(
      command: unknown,
      options?: { abortSignal: AbortSignal },
    ): Promise<{ Body?: AsyncIterable<Uint8Array> | Buffer }>;
  };
  fetchImpl?: typeof fetch;
}): MigrationStorage;
