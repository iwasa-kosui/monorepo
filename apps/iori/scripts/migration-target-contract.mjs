import { createHash } from 'node:crypto';
import { z } from 'zod';

import { parseAdmission } from '../src/workerAdmission.ts';
import { createTargetIdentity } from './fresh-target.mjs';

export const TARGET_BYTES = 64 * 1024;
export const migrationRunIdPattern = /^[A-Za-z0-9_-]{1,80}$/;
const id = z.string().regex(migrationRunIdPattern);
const name = z.string().min(1).max(253);
const resource = z.object({ id, name }).strict();
const identity = z.object({
  environment: z.enum(['production', 'staging']),
  generation: name,
  main_sha: z.string().regex(/^[a-f0-9]{40}$/),
  run_id: id,
  account_id: z.string().regex(/^[a-f0-9]{32}$/),
  backend_bucket: name,
  backend_key: name,
  worker_name: name,
}).strict();
const resources = z.object({
  d1: resource,
  kv: resource,
  uploads: z.object({ name }).strict(),
  transfer: z.object({ name }).strict(),
  queue: resource,
  dlq: resource,
  consumer: z.object({ id, queue_id: id, worker_name: name, dead_letter_queue_id: id }).strict(),
}).strict();
const admission = z.object({
  environment: z.enum(['production', 'staging']),
  generation: name,
  mainSha: name,
  runId: id,
  hostname: name,
  workerHostname: name,
  smoke: z.object({ username: name, uploadFilename: name, articleId: name }).strict(),
}).strict();
const fields = { identity, resources, admission };
const expectedSchema = z.object({ schema: z.literal('iori-migration-expected-target/v1'), ...fields }).strict();
const observed = z.object({
  worker_version_id: id,
  admission_mode: z.literal('sealed'),
  previews_enabled: z.literal(false),
  route_present: z.literal(false),
  queue_delivery_paused: z.literal(true),
  dlq_delivery_paused: z.literal(true),
  consumer_id: id,
}).strict();
const recordSchema = z.object({ schema: z.literal('iori-target-preparation/v1'), ...fields, observed }).strict();
const summarySchema = z.object({
  schema: z.literal('iori-migration-phase-artifact/v1/terraform_target_summary'),
  status: z.literal('completed'),
  ...fields,
  preparation: z.object({ record_sha256: z.string().regex(/^[a-f0-9]{64}$/), record: recordSchema }).strict(),
  observed,
}).strict();
const fail = () => {
  throw new Error('Migration target evidence is invalid.');
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
export const targetHash = (body) => createHash('sha256').update(body).digest('hex');
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export const targetIdentity = (target) =>
  createTargetIdentity({
    environment: target.identity.environment,
    generation: target.identity.generation,
    accountId: target.identity.account_id,
    backendBucket: target.identity.backend_bucket,
  });
export const admissionEnvironment = (target) => ({
  IORI_ADMISSION_MODE: 'sealed',
  IORI_ADMISSION_IDENTITY: JSON.stringify(target.admission),
  ORIGIN: `https://${target.admission.hostname}`,
});
export const parseExpectedTarget = (input) => {
  try {
    if (Buffer.byteLength(JSON.stringify(input)) > TARGET_BYTES) fail();
    const target = expectedSchema.parse(input);
    const derived = targetIdentity(target);
    const { identity: i, resources: r, admission: a } = target;
    if (i.backend_key !== derived.backendKey || i.worker_name !== derived.workerName) fail();
    for (const key of ['d1', 'kv', 'uploads', 'transfer', 'queue', 'dlq']) {
      if (r[key].name !== derived.names[key]) fail();
    }
    if (
      new Set([r.d1.id, r.kv.id, r.queue.id, r.dlq.id]).size !== 4
      || r.consumer.queue_id !== r.queue.id || r.consumer.dead_letter_queue_id !== r.dlq.id
      || r.consumer.worker_name !== derived.workerName || a.environment !== i.environment
      || a.generation !== i.generation || a.mainSha !== i.main_sha || a.runId !== i.run_id
      || !parseAdmission(admissionEnvironment(target))
    ) fail();
    return target;
  } catch {
    fail();
  }
};
export const preparationRecordKey = (target) => {
  const { identity: i } = parseExpectedTarget(target);
  return `prepared-target/v1/${i.environment}/${i.generation}/record.json`;
};
export const serializePreparationRecord = (input) => {
  const record = recordSchema.parse(input);
  parseExpectedTarget({
    schema: 'iori-migration-expected-target/v1',
    identity: record.identity,
    resources: record.resources,
    admission: record.admission,
  });
  if (record.observed.consumer_id !== record.resources.consumer.id) fail();
  const body = Buffer.from(JSON.stringify(canonical(record)) + '\n');
  if (body.length > TARGET_BYTES) fail();
  return body;
};
export const parsePreparationRecord = (body, input) => {
  try {
    const expected = parseExpectedTarget(input);
    if (!Buffer.isBuffer(body) || body.length > TARGET_BYTES) fail();
    const record = recordSchema.parse(JSON.parse(body.toString('utf8')));
    if (!serializePreparationRecord(record).equals(body)) fail();
    for (const key of ['identity', 'resources', 'admission']) if (!equal(record[key], expected[key])) fail();
    return { record, sha256: targetHash(body) };
  } catch {
    fail();
  }
};
export const assertTargetSummary = (input, expected) => {
  try {
    const summary = summarySchema.parse(input);
    const prepared = parsePreparationRecord(serializePreparationRecord(summary.preparation.record), expected);
    if (prepared.sha256 !== summary.preparation.record_sha256) fail();
    for (const key of ['identity', 'resources', 'admission', 'observed']) {
      if (!equal(summary[key], prepared.record[key])) fail();
    }
    return summary;
  } catch {
    fail();
  }
};
/** Only trusted setup calls this on final outputs from its explicitly selected backend. */
const expectedAtPause = ({ identity: supplied, mainSha, runId, admission: a, outputs }, paused) => {
  const derived = createTargetIdentity(supplied);
  const { workerBindings: b, targetIdentity: t, migrationStorage: s } = outputs;
  if (
    t.account_id !== derived.accountId || t.environment !== derived.environment || t.generation !== derived.generation
    || t.backend_key !== derived.backendKey || t.worker_name !== derived.workerName
    || t.d1_database_name !== derived.names.d1 || b.worker_name !== derived.workerName
    || b.queue_name !== derived.names.queue || s.environment !== derived.environment
    || t.queue_settings?.delivery_paused !== paused || t.dlq_settings?.delivery_paused !== true
    || !Array.isArray(t.consumer) || t.consumer.length !== 1
  ) fail();
  const c = t.consumer[0];
  if (
    c.account_id !== derived.accountId || c.type !== 'worker' || c.dead_letter_queue !== derived.names.dlq
    || c.settings?.batch_size !== 1 || c.settings?.max_wait_time_ms !== 1000
    || c.settings?.max_retries !== 3 || c.settings?.retry_delay !== 30
  ) fail();
  return parseExpectedTarget({
    schema: 'iori-migration-expected-target/v1',
    identity: {
      environment: derived.environment,
      generation: derived.generation,
      main_sha: mainSha,
      run_id: runId,
      account_id: derived.accountId,
      backend_bucket: derived.backendBucket,
      backend_key: t.backend_key,
      worker_name: t.worker_name,
    },
    resources: {
      d1: { id: b.d1_database_id, name: t.d1_database_name },
      kv: { id: b.kv_namespace_id, name: derived.names.kv },
      uploads: { name: b.r2_bucket_name },
      transfer: { name: s.bucket_name },
      queue: { id: t.queue_id, name: b.queue_name },
      dlq: { id: t.dlq_id, name: derived.names.dlq },
      consumer: { id: c.consumer_id, queue_id: c.queue_id, worker_name: c.script_name, dead_letter_queue_id: t.dlq_id },
    },
    admission: a,
  });
};

export const expectedTargetFromOutputs = input => expectedAtPause(input, true);
export const activeTargetFromOutputs = input => expectedAtPause(input, false);
