import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { listDatabases, matchesOf, request } from './delete-rehearsal-d1.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { parseWorkflowInvocation, repostCreatedBefore, workflowTimeBudget } from './workflow-context.mjs';

const MODES = Object.freeze({
  'delete-unfollowed-posts-dry-run': 'dry-run',
  'delete-unfollowed-posts': 'apply',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERATION = /^[a-z][a-z0-9]{7,19}$/;
const UUID_V4_SQL = [
  'lower(hex(randomblob(4)))',
  'lower(hex(randomblob(2)))',
  '\'4\' || substr(lower(hex(randomblob(2))), 2)',
  'substr(\'89ab\', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2)',
  'lower(hex(randomblob(6)))',
].join(' || \'-\' || ');
const DELETED_EVENT_EXISTS = (id) =>
  `EXISTS (SELECT 1 FROM domain_events e WHERE e.aggregateName = 'timelineItem' AND e.eventName = 'timelineItem.deleted' AND e.aggregateId = json_object('timelineItemId', ${id}))`;

export const targetCondition = (beforeMs) =>
  `t.type = 'post' AND t.deletedAt IS NULL AND t.createdAt <= ${beforeMs} AND NOT EXISTS (SELECT 1 FROM follows f JOIN local_actors la ON la.actorId = f.followerId WHERE f.followingId = t.actorId) AND NOT EXISTS (SELECT 1 FROM local_actors la2 WHERE la2.actorId = t.actorId)`;

export const dryRunSql = (beforeMs) =>
  `SELECT COUNT(*) AS targets FROM timeline_items t WHERE ${targetCondition(beforeMs)}`;
export const applySql = ({ beforeMs, now }) => [
  `INSERT INTO domain_events (eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt) SELECT ${UUID_V4_SQL}, json_object('timelineItemId', t.timelineItemId), 'timelineItem', NULL, 'timelineItem.deleted', json_object('timelineItemId', t.timelineItemId), ${now} FROM timeline_items t WHERE ${
    targetCondition(beforeMs)
  } AND NOT ${DELETED_EVENT_EXISTS('t.timelineItemId')}`,
  `UPDATE timeline_items AS t SET deletedAt = ${now} WHERE ${targetCondition(beforeMs)}`,
];
export const applyCountSql = (now) =>
  `SELECT COUNT(*) AS deleted FROM timeline_items WHERE type = 'post' AND deletedAt = ${now}`;

const defaultNotice = (line) => process.stderr.write(`${line}\n`);
const fail = (stage, reason, message) => Object.assign(withReason(new Error(message), reason), { stage });
const at = async (stage, operation) => {
  try {
    return await operation();
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.stage === undefined) error.stage = stage;
    throw error;
  }
};
const count = (row, key) => {
  const value = row?.[key];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw fail('delete-posts-query', 'result-invalid', 'D1 query result is invalid.');
  }
  return value;
};

export const deleteUnfollowedPosts = async ({
  env,
  mode,
  signal,
  fetchRequest = fetch,
  notice = defaultNotice,
  now = Date.now(),
}) => {
  if (!['dry-run', 'apply'].includes(mode)) throw fail('delete-posts', 'config-invalid', 'Invalid mode.');
  if (env.IORI_ENVIRONMENT !== 'production') {
    throw fail('delete-posts', 'config-invalid', 'Deleting posts requires production.');
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw fail('delete-posts', 'credentials-missing', 'Cloudflare credentials are required.');
  }
  const beforeMs = repostCreatedBefore(env.IORI_REPOST_CREATED_BEFORE_MS, now);
  if (
    !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) || beforeMs === undefined
    || !GENERATION.test(env.IORI_GENERATION ?? '')
  ) throw fail('delete-posts', 'config-invalid', 'Deleting posts inputs are invalid.');
  const context = { accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN, signal, fetchRequest };
  const name = `iori-production-${env.IORI_GENERATION}`;
  const databases = matchesOf(await at('delete-posts-resolve', () => listDatabases(context)), name);
  if (databases.length === 0) throw fail('delete-posts-resolve', 'resource-missing', 'D1 is missing.');
  if (databases.length > 1) throw fail('delete-posts-resolve', 'resource-ambiguous', 'D1 name is ambiguous.');
  const uuid = databases[0].uuid;
  if (typeof uuid !== 'string' || !UUID.test(uuid)) {
    throw fail('delete-posts-resolve', 'result-invalid', 'D1 id is invalid.');
  }
  const path = `/accounts/${context.accountId}/d1/database/${uuid}`;
  const detail = await at('delete-posts-resolve', () => request({ ...context, method: 'GET', path }));
  if (detail.result === null || typeof detail.result !== 'object' || detail.result.name !== name) {
    throw fail('delete-posts-resolve', 'identity-mismatch', 'D1 name does not match.');
  }
  const query = (stage, sql) =>
    at(stage, async () => {
      const body = await request({ ...context, method: 'POST', path: `${path}/query`, body: { sql } });
      if (
        !Array.isArray(body.result) || body.result.length === 0 || body.result.some((item) => item?.success === false)
      ) {
        throw fail(stage, 'result-invalid', 'D1 query result is invalid.');
      }
      return body.result;
    });
  if (mode === 'dry-run') {
    const [result] = await query('delete-posts-query', dryRunSql(beforeMs));
    const row = result?.results?.[0];
    notice(`IORI_NOTICE delete-unfollowed-posts mode=dry-run targets=${count(row, 'targets')}`);
    return;
  }
  await query('delete-posts-query', applySql({ beforeMs, now }).join(';\n'));
  const [result] = await query('delete-posts-query', applyCountSql(now));
  const row = result?.results?.[0];
  notice(`IORI_NOTICE delete-unfollowed-posts mode=apply deleted=${count(row, 'deleted')}`);
};
export const deleteFailureLines = (error) => operationFailureLines(error?.stage ?? 'delete-posts', error);
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  const mode = MODES[invocation.operation];
  if (mode === undefined) throw new Error('Invalid unfollowed post operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await deleteUnfollowedPosts({ env: process.env, mode, signal });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => main(signal)).then(() => console.log('Unfollowed post operation completed.')).catch(
    (error) => {
      try {
        process.stderr.write(`${deleteFailureLines(error).join('\n')}\n`);
      } catch {}
      console.error('Unfollowed post operation failed; retain current state for reviewed recovery.');
      process.exitCode = 1;
    },
  );
}
