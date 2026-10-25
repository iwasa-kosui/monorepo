import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseExpectedTarget } from './migration-target-contract.mjs';
import { OBJECT_BYTES } from './migration-file-stream.mjs';
export const createMigrationR2Writer = (
  { expectedTarget, accessKeyId, secretAccessKey, signal, createClient = (config) => new S3Client(config) },
) => {
  const target = parseExpectedTarget(expectedTarget);
  if (!accessKeyId || !secretAccessKey) throw new Error('Application R2 credentials are required.');
  const client = createClient({
    region: 'auto',
    endpoint: `https://${target.identity.account_id}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 1,
  });
  return {
    put: async (key, body, options) => {
      try {
        signal?.throwIfAborted();
        if (
          !(body instanceof Uint8Array) || body.length > OBJECT_BYTES || !body.length
          || !/^(?:post-images\/[a-f0-9-]{36}\/original|og\/[a-f0-9-]{36}\.png)$/i.test(key)
        ) throw new Error('Invalid object.');
        await client.send(
          new PutObjectCommand({
            Bucket: target.resources.uploads.name,
            Key: key,
            Body: body,
            ContentType: options.httpMetadata.contentType,
            CacheControl: options.httpMetadata.cacheControl,
            Metadata: options.customMetadata,
          }),
          {
            abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
          },
        );
      } catch {
        throw new Error('Application R2 write failed; outcome may be uncertain.');
      }
    },
  };
};
