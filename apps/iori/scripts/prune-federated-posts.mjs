import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { listDatabases, matchesOf, request } from './delete-rehearsal-d1.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MODES = Object.freeze({ 'prune-federated-posts-dry-run': 'dry-run' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GENERATION = /^[a-z][a-z0-9]{7,19}$/;

export const REASONS = Object.freeze({
  local_likes: 'EXISTS (SELECT 1 FROM likes l WHERE l.postId = c.postId AND l.type = \'local\')',
  local_emoji:
    'EXISTS (SELECT 1 FROM emoji_reacts e JOIN local_actors la ON la.actorId = e.actorId WHERE e.postId = c.postId)',
  home: 'EXISTS (SELECT 1 FROM timeline_items t WHERE t.postId = c.postId AND t.deletedAt IS NULL)',
  local_repost:
    'EXISTS (SELECT 1 FROM reposts r JOIN local_actors la ON la.actorId = r.actorId WHERE r.postId = c.postId)',
  reply:
    '(EXISTS (SELECT 1 FROM remote_posts rp JOIN local_posts lr ON lr.inReplyToUri = rp.uri WHERE rp.postId = c.postId) OR EXISTS (SELECT 1 FROM remote_posts rp JOIN local_posts parent ON parent.postId = replace(rp.inReplyToUri, rtrim(rp.inReplyToUri, replace(rp.inReplyToUri, \'/\', \'\')), \'\') WHERE rp.postId = c.postId AND rp.inReplyToUri IS NOT NULL AND rp.inReplyToUri LIKE \'%/posts/\' || parent.postId))',
  notification:
    '(EXISTS (SELECT 1 FROM notification_likes n WHERE n.likedPostId = c.postId) OR EXISTS (SELECT 1 FROM notification_reposts n WHERE n.repostedPostId = c.postId) OR EXISTS (SELECT 1 FROM notification_emoji_reacts n WHERE n.reactedPostId = c.postId) OR EXISTS (SELECT 1 FROM notification_replies n WHERE n.replyPostId = c.postId OR n.originalPostId = c.postId))',
  article: 'EXISTS (SELECT 1 FROM articles ar WHERE ar.rootPostId = c.postId)',
});
const REASON_NAMES = Object.keys(REASONS);

export const cutoffOf = (now) => now - RETENTION_MS;
export const candidateSql = (cutoffMs) =>
  `SELECT p.postId AS postId FROM posts p JOIN remote_posts rp ON rp.postId = p.postId WHERE p.type = 'remote' AND (SELECT MAX(f.receivedAt) FROM federated_timeline_items f WHERE f.postId = p.postId) < ${cutoffMs}`;
export const dryRunSql = (cutoffMs) =>
  `SELECT COUNT(*) AS candidates, ${
    REASON_NAMES.map((name) => `COALESCE(SUM(${name}), 0) AS ${name}`).join(', ')
  }, COALESCE(SUM(CASE WHEN ${
    REASON_NAMES.map((name) => `${name} = 0`).join(' AND ')
  } THEN 1 ELSE 0 END), 0) AS to_delete FROM (SELECT c.postId AS postId, ${
    REASON_NAMES.map((name) => `${REASONS[name]} AS ${name}`).join(', ')
  } FROM (${candidateSql(cutoffMs)}) c) r`;

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
    throw fail('prune-posts-query', 'result-invalid', 'D1 query result is invalid.');
  }
  return value;
};

export const pruneFederatedPosts = async ({
  env,
  mode,
  signal,
  fetchRequest = fetch,
  notice = defaultNotice,
  now = Date.now(),
}) => {
  if (mode !== 'dry-run') throw fail('prune-posts', 'config-invalid', 'Invalid mode.');
  if (env.IORI_ENVIRONMENT !== 'production') {
    throw fail('prune-posts', 'config-invalid', 'Pruning federated posts requires production.');
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw fail('prune-posts', 'credentials-missing', 'Cloudflare credentials are required.');
  }
  const cutoffMs = cutoffOf(now);
  if (
    !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) || !GENERATION.test(env.IORI_GENERATION ?? '')
    || !Number.isSafeInteger(cutoffMs) || cutoffMs <= 0
  ) throw fail('prune-posts', 'config-invalid', 'Pruning federated posts inputs are invalid.');
  const context = { accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN, signal, fetchRequest };
  const name = `iori-production-${env.IORI_GENERATION}`;
  const databases = matchesOf(await at('prune-posts-resolve', () => listDatabases(context)), name);
  if (databases.length === 0) throw fail('prune-posts-resolve', 'resource-missing', 'D1 is missing.');
  if (databases.length > 1) throw fail('prune-posts-resolve', 'resource-ambiguous', 'D1 name is ambiguous.');
  const uuid = databases[0].uuid;
  if (typeof uuid !== 'string' || !UUID.test(uuid)) {
    throw fail('prune-posts-resolve', 'result-invalid', 'D1 id is invalid.');
  }
  const path = `/accounts/${context.accountId}/d1/database/${uuid}`;
  const detail = await at('prune-posts-resolve', () => request({ ...context, method: 'GET', path }));
  if (detail.result === null || typeof detail.result !== 'object' || detail.result.name !== name) {
    throw fail('prune-posts-resolve', 'identity-mismatch', 'D1 name does not match.');
  }
  const body = await at(
    'prune-posts-query',
    () => request({ ...context, method: 'POST', path: `${path}/query`, body: { sql: dryRunSql(cutoffMs) } }),
  );
  if (
    !Array.isArray(body.result) || body.result.length === 0 || body.result.some((item) => item?.success === false)
  ) {
    throw fail('prune-posts-query', 'result-invalid', 'D1 query result is invalid.');
  }
  const row = body.result[0]?.results?.[0];
  notice(
    `IORI_NOTICE prune-federated-posts mode=dry-run candidates=${count(row, 'candidates')} ${
      REASON_NAMES.map((reason) => `${reason}=${count(row, reason)}`).join(' ')
    } to_delete=${count(row, 'to_delete')} cutoff_ms=${cutoffMs}`,
  );
};
export const pruneFailureLines = (error) => operationFailureLines(error?.stage ?? 'prune-posts', error);
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  const mode = MODES[invocation.operation];
  if (mode === undefined) throw new Error('Invalid prune federated posts operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await pruneFederatedPosts({ env: process.env, mode, signal });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => main(signal)).then(() => console.log('Prune federated posts operation completed.')).catch(
    (error) => {
      try {
        process.stderr.write(`${pruneFailureLines(error).join('\n')}\n`);
      } catch {}
      console.error('Prune federated posts operation failed; no data was changed.');
      process.exitCode = 1;
    },
  );
}
