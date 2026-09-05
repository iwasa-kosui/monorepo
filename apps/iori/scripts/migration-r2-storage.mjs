import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const readBoundedObject = async (body, limit) => {
  const chunks = [];
  let size = 0;
  if (!Number.isSafeInteger(limit) || limit < 0 || body === undefined) {
    throw new Error('Migration storage read failed.');
  }
  try {
    for await (const chunk of Buffer.isBuffer(body) ? [body] : body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) throw new Error('limit');
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, size);
  } catch {
    body?.destroy?.();
    throw new Error('Migration storage read failed.');
  }
};

export const assertMigrationBucketPrivate = async ({ accountId, bucket, apiToken, fetchImpl = fetch }) => {
  try {
    if (!/^[a-f0-9]{32}$/.test(accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !apiToken) {
      throw new Error('invalid');
    }
    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/domains`;
    const request = async (suffix) => {
      const response = await fetchImpl(`${base}/${suffix}`, { headers: { Authorization: `Bearer ${apiToken}` } });
      if (!response.ok) throw new Error('invalid');
      const body = await response.json();
      if (body.success !== true) throw new Error('invalid');
      return body.result;
    };
    const managed = await request('managed');
    const custom = await request('custom');
    if (
      managed?.enabled !== false || !Array.isArray(custom?.domains)
      || custom.domains.some((domain) => domain.enabled !== false)
    ) throw new Error('public');
  } catch {
    throw new Error('Migration bucket privacy preflight failed.');
  }
};

export const createMigrationR2Storage = (
  {
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    apiToken,
    readOnly = false,
    createClient = (config) => new S3Client(config),
    fetchImpl = fetch,
  },
) => {
  if (
    !/^[a-f0-9]{32}$/.test(accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
    || typeof accessKeyId !== 'string' || !accessKeyId || typeof secretAccessKey !== 'string' || !secretAccessKey
  ) {
    throw new Error('Migration storage configuration is invalid.');
  }
  const client = createClient({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 1,
  });
  return {
    assertPrivate: () => assertMigrationBucketPrivate({ accountId, bucket, apiToken, fetchImpl }),
    async get(key, limit) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return await readBoundedObject(result.Body, limit);
      } catch {
        throw new Error('Migration storage read failed.');
      }
    },
    async putNew(key, body) {
      try {
        if (readOnly || !Buffer.isBuffer(body)) throw new Error('invalid');
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentLength: body.length,
            IfNoneMatch: '*',
            ContentType: 'application/octet-stream',
          }),
        );
      } catch {
        throw new Error('Migration storage write failed.');
      }
    },
  };
};
