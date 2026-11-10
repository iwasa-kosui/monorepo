import { z } from 'zod';

import { parseAdmission } from '../src/workerAdmission.ts';
import { createTargetIdentity } from './fresh-target.mjs';

const TARGET_BYTES = 64 * 1024;
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
const expectedSchema = z.object({
  schema: z.literal('iori-migration-expected-target/v1'),
  identity,
  resources,
  admission,
}).strict();
const fail = () => {
  throw new Error('Migration target evidence is invalid.');
};
export const targetIdentity = (target) =>
  createTargetIdentity({
    environment: target.identity.environment,
    generation: target.identity.generation,
    accountId: target.identity.account_id,
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
export const activeTargetFromResolvedIds = ({ identity: supplied, mainSha, runId, admission, resolved }) => {
  const derived = createTargetIdentity(supplied);
  return parseExpectedTarget({
    schema: 'iori-migration-expected-target/v1',
    identity: {
      environment: derived.environment,
      generation: derived.generation,
      main_sha: mainSha,
      run_id: runId,
      account_id: derived.accountId,
      backend_key: derived.backendKey,
      worker_name: derived.workerName,
    },
    resources: {
      d1: { id: resolved.d1Id, name: derived.names.d1 },
      kv: { id: resolved.kvId, name: derived.names.kv },
      uploads: { name: derived.names.uploads },
      transfer: { name: derived.names.transfer },
      queue: { id: resolved.queueId, name: derived.names.queue },
      dlq: { id: resolved.dlqId, name: derived.names.dlq },
      consumer: {
        id: resolved.consumerId,
        queue_id: resolved.queueId,
        worker_name: derived.workerName,
        dead_letter_queue_id: resolved.dlqId,
      },
    },
    admission,
  });
};
