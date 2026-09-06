import type { PutObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import type { ExpectedTarget } from './migration-target-contract.mjs';
export type MigrationObjectWriter = {
  put(
    key: string,
    body: Uint8Array,
    options: { httpMetadata: { contentType: string; cacheControl: string }; customMetadata: Record<string, string> },
  ): Promise<void>;
};
export function createMigrationR2Writer(
  input: {
    expectedTarget: ExpectedTarget;
    accessKeyId: string;
    secretAccessKey: string;
    signal?: AbortSignal;
    createClient?: (
      config: S3ClientConfig,
    ) => { send(command: PutObjectCommand, options: { abortSignal: AbortSignal }): Promise<unknown> };
  },
): MigrationObjectWriter;
