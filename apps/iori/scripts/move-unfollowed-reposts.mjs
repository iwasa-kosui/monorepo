import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { listDatabases, matchesOf, request } from './delete-rehearsal-d1.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { parseWorkflowInvocation, repostCreatedBefore, workflowTimeBudget } from './workflow-context.mjs';

export const RELAY_ACTOR_URI = 'https://relay.fedibird.com/actor';
const MODES = Object.freeze({
  'move-unfollowed-reposts-dry-run': 'dry-run',
  'move-unfollowed-reposts': 'apply',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const GENERATION = /^[a-z][a-z0-9]{7,19}$/;
const UUID_V4_SQL = [
  'lower(hex(randomblob(4)))',
  'lower(hex(randomblob(2)))',
  '\'4\' || substr(lower(hex(randomblob(2))), 2)',
  'substr(\'89ab\', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2)',
  'lower(hex(randomblob(6)))',
].join(' || \'-\' || ');
const FEDERATED_ITEM_EXISTS = (postId) =>
  `EXISTS (SELECT 1 FROM federated_timeline_items x WHERE x.postId = ${postId})`;
const CREATED_EVENT_EXISTS = (id) =>
  `EXISTS (SELECT 1 FROM domain_events e WHERE e.aggregateName = 'federatedTimelineItem' AND e.eventName = 'federatedTimelineItem.created' AND e.aggregateId = json_object('federatedTimelineItemId', ${id}))`;
const DELETED_EVENT_EXISTS = (id) =>
  `EXISTS (SELECT 1 FROM domain_events e WHERE e.aggregateName = 'timelineItem' AND e.eventName = 'timelineItem.deleted' AND e.aggregateId = json_object('timelineItemId', ${id}))`;

export const targetCondition = (beforeMs) =>
  `t.type = 'repost' AND t.deletedAt IS NULL AND t.createdAt <= ${beforeMs} AND NOT EXISTS (SELECT 1 FROM follows f JOIN local_actors la ON la.actorId = f.followerId WHERE f.followingId = t.actorId) AND NOT EXISTS (SELECT 1 FROM local_actors la2 WHERE la2.actorId = t.actorId) AND NOT EXISTS (SELECT 1 FROM posts p JOIN local_actors la ON la.actorId = p.actorId WHERE p.postId = t.postId)`;
const targetPosts = (beforeMs) =>
  `SELECT t.postId AS postId, MIN(t.createdAt) AS receivedAt FROM timeline_items t WHERE ${
    targetCondition(beforeMs)
  } AND EXISTS (SELECT 1 FROM posts p WHERE p.postId = t.postId) GROUP BY t.postId`;

export const relaySql = () => `SELECT relayId, status FROM relays WHERE actorUri = '${RELAY_ACTOR_URI}'`;
export const dryRunSql = (beforeMs) =>
  `SELECT (SELECT COUNT(*) FROM timeline_items t WHERE ${
    targetCondition(beforeMs)
  }) AS targets, (SELECT COUNT(DISTINCT t.postId) FROM timeline_items t WHERE ${
    targetCondition(beforeMs)
  }) AS posts, (SELECT COUNT(*) FROM (SELECT DISTINCT t.postId AS postId FROM timeline_items t WHERE ${
    targetCondition(beforeMs)
  }) g WHERE ${FEDERATED_ITEM_EXISTS('g.postId')}) AS already_federated, (SELECT COUNT(*) FROM (${
    targetPosts(beforeMs)
  }) g WHERE NOT ${FEDERATED_ITEM_EXISTS('g.postId')}) AS to_create, (SELECT COUNT(*) FROM timeline_items t WHERE ${
    targetCondition(beforeMs)
  } AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.postId = t.postId)) AS missing_posts`;
const itemJson = (alias) =>
  `json_object('federatedTimelineItemId', ${alias}.federatedTimelineItemId, 'postId', ${alias}.postId, 'relayId', ${alias}.relayId, 'receivedAt', ${alias}.receivedAt)`;
export const applySql = ({ relayId, beforeMs, now }) => [
  `INSERT INTO federated_timeline_items (federatedTimelineItemId, postId, relayId, receivedAt) SELECT ${UUID_V4_SQL}, g.postId, '${relayId}', g.receivedAt FROM (${
    targetPosts(beforeMs)
  }) g WHERE NOT ${FEDERATED_ITEM_EXISTS('g.postId')}`,
  `INSERT INTO domain_events (eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt) SELECT ${UUID_V4_SQL}, json_object('federatedTimelineItemId', f.federatedTimelineItemId), 'federatedTimelineItem', ${
    itemJson('f')
  }, 'federatedTimelineItem.created', ${itemJson('f')}, ${now} FROM federated_timeline_items f JOIN (${
    targetPosts(beforeMs)
  }) g ON g.postId = f.postId AND g.receivedAt = f.receivedAt WHERE f.relayId = '${relayId}' AND NOT ${
    CREATED_EVENT_EXISTS('f.federatedTimelineItemId')
  }`,
  `INSERT INTO domain_events (eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt) SELECT ${UUID_V4_SQL}, json_object('timelineItemId', t.timelineItemId), 'timelineItem', NULL, 'timelineItem.deleted', json_object('timelineItemId', t.timelineItemId), ${now} FROM timeline_items t WHERE ${
    targetCondition(beforeMs)
  } AND NOT ${DELETED_EVENT_EXISTS('t.timelineItemId')}`,
  `UPDATE timeline_items AS t SET deletedAt = ${now} WHERE ${targetCondition(beforeMs)}`,
];
export const applyCountSql = (now) =>
  `SELECT (SELECT COUNT(*) FROM domain_events WHERE aggregateName = 'federatedTimelineItem' AND eventName = 'federatedTimelineItem.created' AND occurredAt = ${now}) AS created, (SELECT COUNT(*) FROM timeline_items WHERE type = 'repost' AND deletedAt = ${now}) AS deleted`;

const defaultNotice = (line) => process.stderr.write(`${line}\n`);
export const fail = (stage, reason, message) => Object.assign(withReason(new Error(message), reason), { stage });
const at = async (stage, operation) => {
  try {
    return await operation();
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.stage === undefined) error.stage = stage;
    throw error;
  }
};
export const openD1Query = async ({ env, signal, fetchRequest, prefix }) => {
  const resolveStage = `${prefix}-resolve`;
  const context = { accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN, signal, fetchRequest };
  const name = `iori-production-${env.IORI_GENERATION}`;
  const databases = matchesOf(await at(resolveStage, () => listDatabases(context)), name);
  if (databases.length === 0) throw fail(resolveStage, 'resource-missing', 'D1 is missing.');
  if (databases.length > 1) throw fail(resolveStage, 'resource-ambiguous', 'D1 name is ambiguous.');
  const uuid = databases[0].uuid;
  if (typeof uuid !== 'string' || !UUID.test(uuid)) {
    throw fail(resolveStage, 'result-invalid', 'D1 id is invalid.');
  }
  const path = `/accounts/${context.accountId}/d1/database/${uuid}`;
  const detail = await at(resolveStage, () => request({ ...context, method: 'GET', path }));
  if (detail.result === null || typeof detail.result !== 'object' || detail.result.name !== name) {
    throw fail(resolveStage, 'identity-mismatch', 'D1 name does not match.');
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
  return { query };
};

const count = (row, key) => {
  const value = row?.[key];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw fail('move-reposts-query', 'result-invalid', 'D1 query result is invalid.');
  }
  return value;
};

export const moveUnfollowedReposts = async ({
  env,
  mode,
  signal,
  fetchRequest = fetch,
  notice = defaultNotice,
  now = Date.now(),
}) => {
  if (!['dry-run', 'apply'].includes(mode)) throw fail('move-reposts', 'config-invalid', 'Invalid mode.');
  if (env.IORI_ENVIRONMENT !== 'production') {
    throw fail('move-reposts', 'config-invalid', 'Moving reposts requires production.');
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw fail('move-reposts', 'credentials-missing', 'Cloudflare credentials are required.');
  }
  const beforeMs = repostCreatedBefore(env.IORI_REPOST_CREATED_BEFORE_MS, now);
  if (
    !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) || beforeMs === undefined
    || !GENERATION.test(env.IORI_GENERATION ?? '')
  ) throw fail('move-reposts', 'config-invalid', 'Moving reposts inputs are invalid.');
  const { query } = await openD1Query({ env, signal, fetchRequest, prefix: 'move-reposts' });
  const [relayResult] = await query('move-reposts-resolve', relaySql());
  const relays = relayResult?.results;
  if (!Array.isArray(relays) || relays.length === 0) {
    throw fail('move-reposts-resolve', 'resource-missing', 'Relay is missing.');
  }
  if (relays.length > 1 || relays[0]?.status !== 'accepted') {
    throw fail('move-reposts-resolve', 'state-mismatch', 'Relay is not accepted.');
  }
  const relayId = relays[0].relayId;
  if (typeof relayId !== 'string' || !UUID.test(relayId)) {
    throw fail('move-reposts-resolve', 'result-invalid', 'Relay id is invalid.');
  }
  if (mode === 'dry-run') {
    const [result] = await query('move-reposts-query', dryRunSql(beforeMs));
    const row = result?.results?.[0];
    notice(
      `IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=${count(row, 'targets')} posts=${
        count(row, 'posts')
      } already_federated=${count(row, 'already_federated')} to_create=${count(row, 'to_create')} missing_posts=${
        count(row, 'missing_posts')
      }`,
    );
    return;
  }
  await query('move-reposts-query', applySql({ relayId, beforeMs, now }).join(';\n'));
  const [result] = await query('move-reposts-query', applyCountSql(now));
  const row = result?.results?.[0];
  notice(
    `IORI_NOTICE move-unfollowed-reposts mode=apply created=${count(row, 'created')} deleted=${count(row, 'deleted')}`,
  );
};
export const moveFailureLines = (error) => operationFailureLines(error?.stage ?? 'move-reposts', error);
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  const mode = MODES[invocation.operation];
  if (mode === undefined) throw new Error('Invalid unfollowed repost operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await moveUnfollowedReposts({ env: process.env, mode, signal });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => main(signal)).then(() => console.log('Unfollowed repost operation completed.')).catch(
    (error) => {
      try {
        process.stderr.write(`${moveFailureLines(error).join('\n')}\n`);
      } catch {}
      console.error('Unfollowed repost operation failed; retain current state for reviewed recovery.');
      process.exitCode = 1;
    },
  );
}
