import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { withCliSignal } from './cli-lifetime.mjs';
import { APPLICATION_TABLE_ORDER } from './export-postgres-lib.mjs';
import { queryMigrationD1, reviewedD1Schema } from './migration-d1-import.mjs';
import { assertMigrationBucketPrivate } from './migration-r2-storage.mjs';
import { parseExpectedTarget, rehearsalTargetKey, targetIdentity } from './migration-target-contract.mjs';
import { loadExpectedTarget } from './migration-target-input.mjs';
import { transferStorageFromEnvironment } from './migration-target-setup.mjs';
import { readPreparationRecord } from './target-preparation-record.mjs';

const DELETE_BATCH = 1000;
const markSchema = z.object({
  schema: z.literal('iori-migration-rehearsal-target/v1'),
  main_sha: z.string(),
  run_id: z.string(),
}).strict();
const reviewedTables = async () => {
  const schema = await readFile(reviewedD1Schema, 'utf8');
  const names = [...schema.matchAll(/^CREATE TABLE `([a-z_]+)`/gm)].map((match) => match[1]);
  if (
    names.length !== APPLICATION_TABLE_ORDER.length || new Set(names).size !== names.length
    || APPLICATION_TABLE_ORDER.some((table) => !names.includes(table))
  ) throw new Error('Reviewed D1 schema does not match the application tables.');
  return [...APPLICATION_TABLE_ORDER].reverse();
};
const assertRehearsalMark = async (storage, target) => {
  const body = await storage.getIfExists(rehearsalTargetKey(target), 65536);
  if (body === null) throw new Error('Target generation was not used for rehearsal.');
  let mark;
  try {
    mark = markSchema.parse(JSON.parse(body.toString('utf8')));
  } catch {
    throw new Error('Rehearsal target mark is invalid.');
  }
  if (mark.main_sha !== target.identity.main_sha || mark.run_id !== target.identity.run_id) {
    throw new Error('Rehearsal target mark does not match the invocation.');
  }
};
const purgeD1 = async (tables, query) => {
  for (const table of tables) await query(`DELETE FROM "${table}"`);
  for (const table of tables) {
    const rows = await query(`SELECT COUNT(*) AS count FROM "${table}"`);
    if (rows.length !== 1 || rows[0]?.count !== 0) throw new Error('D1 application tables are not empty.');
  }
};
const purgeObjects = async ({ client, bucket, deadline }) => {
  const send = (command) => client.send(command, { abortSignal: deadline() });
  const listAll = async () => {
    const keys = [];
    let token;
    do {
      const page = await send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
      const contents = page.Contents ?? [];
      if (
        !Array.isArray(contents) || contents.some((item) => typeof item?.Key !== 'string' || !item.Key)
        || typeof page.IsTruncated !== 'boolean' || (page.IsTruncated && !page.NextContinuationToken)
      ) throw new Error('invalid');
      for (const item of contents) keys.push(item.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
    return keys;
  };
  try {
    const keys = await listAll();
    for (let start = 0; start < keys.length; start += DELETE_BATCH) {
      const result = await send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.slice(start, start + DELETE_BATCH).map((Key) => ({ Key })) },
        }),
      );
      if (result?.Errors !== undefined && !(Array.isArray(result.Errors) && result.Errors.length === 0)) {
        throw new Error('invalid');
      }
    }
    if ((await listAll()).length !== 0) throw new Error('invalid');
  } catch {
    throw new Error('Application R2 purge failed.');
  }
};
export const purgeRehearsalTarget = async (options) => {
  const target = parseExpectedTarget(options.expectedTarget);
  const { storage, apiToken, accessKeyId, secretAccessKey, signal, fetchImpl, queryD1, createClient } = options;
  if (!accessKeyId || !secretAccessKey) throw new Error('Application R2 credentials are required.');
  await readPreparationRecord({ storage, expectedTarget: target });
  await assertRehearsalMark(storage, target);
  const bucket = target.resources.uploads.name;
  await assertMigrationBucketPrivate({ accountId: target.identity.account_id, bucket, apiToken, fetchImpl, signal });
  const tables = await reviewedTables();
  await purgeD1(
    tables,
    queryD1
      ?? ((sql) => queryMigrationD1({ expectedTarget: target, apiToken, sql, signal, fetchRequest: fetchImpl })),
  );
  const client = (createClient ?? ((config) => new S3Client(config)))({
    region: 'auto',
    endpoint: `https://${target.identity.account_id}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 1,
  });
  await purgeObjects({
    client,
    bucket,
    deadline: () => signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
  });
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(async (signal) => {
    const expectedTarget = await loadExpectedTarget(process.env.IORI_MIGRATION_EXPECTED_TARGET_PATH);
    const required = (key) => {
      if (!process.env[key]) throw new Error('Purge configuration is required.');
      return process.env[key];
    };
    if (
      required('MAIN_SHA') !== expectedTarget.identity.main_sha
      || required('IORI_MIGRATION_RUN_ID') !== expectedTarget.identity.run_id
    ) throw new Error('Invocation mismatch.');
    required('IORI_MIGRATION_R2_ACCESS_KEY_ID');
    required('IORI_MIGRATION_R2_SECRET_ACCESS_KEY');
    await purgeRehearsalTarget({
      expectedTarget,
      storage: transferStorageFromEnvironment(process.env, targetIdentity(expectedTarget), true, signal),
      apiToken: required('CLOUDFLARE_API_TOKEN'),
      accessKeyId: required('IORI_APPLICATION_R2_ACCESS_KEY_ID'),
      secretAccessKey: required('IORI_APPLICATION_R2_SECRET_ACCESS_KEY'),
      signal,
    });
  }).then(() => console.log('Rehearsal target purged.')).catch(() => {
    console.error('Rehearsal target purge failed; retain the generation for review.');
    process.exitCode = 1;
  });
}
