import { parseExpectedTarget } from './migration-target-contract.mjs';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

import { canonicalRowSummary } from './canonical-row-sort.mjs';
import { canonicalD1RowString } from './data-migration-mapping.mjs';
import { APPLICATION_TABLE_ORDER } from './export-postgres.mjs';
import { materializeWorkerBindings } from './materialize-worker-bindings.mjs';
import { assertPrivateMountedInput } from './validate-private-mounted-inputs.mjs';

const fail = () => new Error('Cloudflare import read failed.');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const boundedJson = async (response) => {
  if (!response.ok || !response.body) throw fail();
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024) throw fail();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
};
export const createCloudflareImportTransport = ({
  bindings,
  expectedWorkerName,
  accountId,
  apiToken,
  accessKeyId,
  secretAccessKey,
  fetchImpl = fetch,
  createClient = (config) => new S3Client(config),
  pageSize = 100,
  sortChunkBytes,
}) => {
  let validated;
  try {
    validated = materializeWorkerBindings({ bindings, expectedWorkerName });
    if (
      !/^[a-f0-9]{32}$/.test(accountId) || typeof accountId !== 'string'
      || ![apiToken, accessKeyId, secretAccessKey].every(nonempty)
      || !/^[a-f0-9-]{36}$/.test(validated.d1_database_id)
      || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(validated.r2_bucket_name)
      || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000
    ) throw fail();
  } catch {
    throw fail();
  }
  const client = createClient({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 1,
  });
  const query = async (sql, params) => {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${validated.d1_database_id}/query`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params: params.map(String) }),
      },
    );
    const data = await boundedJson(response);
    if (
      data?.success !== true || !Array.isArray(data.result) || data.result.length !== 1
      || data.result[0]?.success !== true || !Array.isArray(data.result[0].results)
      || (Array.isArray(data.errors) && data.errors.length)
    ) throw fail();
    return data.result[0].results;
  };
  return {
    getTableSummaries: async (tables) => {
      try {
        if (
          !Array.isArray(tables) || new Set(tables).size !== tables.length
          || tables.some(table => !APPLICATION_TABLE_ORDER.includes(table))
        ) throw fail();
        const summaries = {};
        for (const table of tables) {
          const countRows = async () => {
            const results = await query(`SELECT COUNT(*) AS count FROM "${table}"`, []);
            if (
              results.length !== 1 || Object.keys(results[0] ?? {}).length !== 1
              || !Number.isSafeInteger(results[0]?.count) || results[0].count < 0
            ) throw fail();
            return results[0].count;
          };
          const count = await countRows();
          const rows = async function*() {
            let cursor;
            let observed = 0;
            while (true) {
              const page = await query(
                `SELECT rowid AS __iori_rowid, * FROM "${table}"${
                  cursor === undefined ? '' : ' WHERE rowid > ?'
                } ORDER BY rowid LIMIT ?`,
                cursor === undefined ? [pageSize] : [cursor, pageSize],
              );
              if (page.length > pageSize || observed + page.length > count) throw fail();
              for (const item of page) {
                if (item === null || typeof item !== 'object' || Array.isArray(item)) throw fail();
                const { __iori_rowid: next, ...row } = item;
                if (
                  !Number.isSafeInteger(next) || (cursor !== undefined && next <= cursor) || !Object.keys(row).length
                  || Object.values(row).some(value => value !== null && !['string', 'number'].includes(typeof value))
                ) throw fail();
                cursor = next;
                observed++;
                yield canonicalD1RowString(table, row);
              }
              if (page.length < pageSize) {
                if (observed !== count) throw fail();
                break;
              }
            }
          };
          const summary = await canonicalRowSummary(rows(), { chunkBytes: sortChunkBytes });
          if (summary.count !== count || await countRows() !== count) throw fail();
          summaries[table] = summary;
        }
        return summaries;
      } catch {
        throw fail();
      }
    },
    getObject: async (key) => {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: validated.r2_bucket_name, Key: key }), {
          abortSignal: AbortSignal.timeout(30_000),
        });
        if (!result.Body || typeof result.ContentType !== 'string' || !result.ContentType) throw fail();
        const source = result.Body instanceof Readable
          ? result.Body
          : Readable.fromWeb(result.Body.transformToWebStream());
        const safe = async function*() {
          try {
            for await (const chunk of source) yield chunk;
          } catch {
            throw fail();
          }
        };
        return { body: Readable.toWeb(Readable.from(safe())), httpMetadata: { contentType: result.ContentType } };
      } catch (error) {
        if (error?.name === 'NoSuchKey') return null;
        throw fail();
      }
    },
    listObjects: async (prefix, cursor) => {
      try {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: validated.r2_bucket_name,
            Prefix: prefix,
            ContinuationToken: cursor,
            MaxKeys: 1000,
          }),
          { abortSignal: AbortSignal.timeout(30_000) },
        );
        const contents = result.Contents === undefined ? [] : result.Contents;
        if (
          !Array.isArray(contents) || contents.length > 1000 || contents.some(item => !nonempty(item?.Key))
          || (result.NextContinuationToken !== undefined && !nonempty(result.NextContinuationToken))
          || (result.KeyCount !== undefined && result.KeyCount !== contents.length)
          || typeof result.IsTruncated !== 'boolean' || (result.IsTruncated && !nonempty(result.NextContinuationToken))
        ) throw fail();
        return {
          keys: contents.map(item => item.Key),
          ...(result.IsTruncated ? { cursor: result.NextContinuationToken } : {}),
        };
      } catch {
        throw fail();
      }
    },
  };
};

export const createCloudflareImportTransportFromEnvironment = async (environment, options = {}) => {
  try {
    const path = environment.IORI_WORKER_BINDINGS_PATH;
    await assertPrivateMountedInput(path);
    if ((await stat(path)).size > 65536) throw fail();
    const bindings = JSON.parse(await readFile(path, 'utf8'));
    const target = parseExpectedTarget(options.expectedTarget);
    if (
      target.identity.account_id !== environment.CLOUDFLARE_ACCOUNT_ID
      || target.identity.worker_name !== environment.WORKER_NAME
      || bindings.d1_database_id !== target.resources.d1.id || bindings.kv_namespace_id !== target.resources.kv.id
      || bindings.r2_bucket_name !== target.resources.uploads.name
      || bindings.queue_name !== target.resources.queue.name
      || bindings.worker_name !== target.identity.worker_name
    ) throw fail();
    return createCloudflareImportTransport({
      ...options,
      bindings,
      expectedWorkerName: environment.WORKER_NAME,
      accountId: environment.CLOUDFLARE_ACCOUNT_ID,
      apiToken: environment.CLOUDFLARE_API_TOKEN,
      accessKeyId: environment.IORI_APPLICATION_R2_ACCESS_KEY_ID,
      secretAccessKey: environment.IORI_APPLICATION_R2_SECRET_ACCESS_KEY,
    });
  } catch {
    throw fail();
  }
};
