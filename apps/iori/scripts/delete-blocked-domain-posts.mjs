import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { listDatabases, matchesOf, request } from './delete-rehearsal-d1.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';

export const TARGET_DOMAIN = 'baraag.net';
const MODES = Object.freeze({
  'delete-blocked-domain-posts-dry-run': 'dry-run',
  'delete-blocked-domain-posts': 'apply',
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
const EVENT_COLUMNS = '(eventId, aggregateId, aggregateName, aggregateState, eventName, eventPayload, occurredAt)';

const hostOf = (uri) => `substr(${uri}, 9, instr(substr(${uri}, 9) || '/', '/') - 1)`;
const hostnameOf = (uri) => `substr(${hostOf(uri)}, 1, instr(${hostOf(uri)} || ':', ':') - 1)`;
export const hostMatches = (uri) =>
  `(${uri} LIKE 'https://%/%' AND (${hostnameOf(uri)} LIKE '${TARGET_DOMAIN}' OR ${
    hostnameOf(uri)
  } LIKE '%.${TARGET_DOMAIN}'))`;
export const targetActorCondition = (alias) =>
  `${hostMatches(`${alias}.uri`)} AND NOT EXISTS (SELECT 1 FROM local_actors lx WHERE lx.actorId = ${alias}.actorId)`;
const domainPostCondition = (alias) =>
  `${alias}.actorId IN (SELECT a.actorId FROM actors a WHERE ${targetActorCondition('a')})`;
const ARTICLE_ROOT = (alias) => `EXISTS (SELECT 1 FROM articles ar WHERE ar.rootPostId = ${alias}.postId)`;
export const targetPostCondition = (alias) => `${domainPostCondition(alias)} AND NOT ${ARTICLE_ROOT(alias)}`;
const TARGET_POST_IDS = `SELECT p.postId FROM posts p WHERE ${targetPostCondition('p')}`;
const IN_TARGETS = (column) => `${column} IN (${TARGET_POST_IDS})`;

const EVENT_EXISTS = (aggregateName, eventName, aggregateId) =>
  `EXISTS (SELECT 1 FROM domain_events e WHERE e.aggregateName = '${aggregateName}' AND e.eventName = '${eventName}' AND e.aggregateId = ${aggregateId})`;
const idJson = (key, column) => `json_object('${key}', ${column})`;
const insertEvents = (
  { aggregateName, eventName, aggregateId, aggregateIdIsText = false, payload, from, where, now },
) => {
  const id = aggregateIdIsText ? aggregateId : idJson(aggregateId.key, aggregateId.column);
  return `INSERT INTO domain_events ${EVENT_COLUMNS} SELECT ${UUID_V4_SQL}, ${id}, '${aggregateName}', NULL, '${eventName}', ${payload}, ${now} FROM ${from} WHERE ${where} AND NOT ${
    EVENT_EXISTS(aggregateName, eventName, id)
  }`;
};
const payloadJson = (alias, keys) => `json_object(${keys.map((key) => `'${key}', ${alias}.${key}`).join(', ')})`;

const notificationEvents = ({ table, alias, eventName, keys, where, now }) =>
  insertEvents({
    aggregateName: 'notification',
    eventName,
    aggregateId: { key: 'notificationId', column: `${alias}.notificationId` },
    payload: payloadJson(alias, keys),
    from: `${table} ${alias}`,
    where,
    now,
  });
const REPLY_TARGET = `${IN_TARGETS('replyPostId')} OR ${IN_TARGETS('originalPostId')}`;
const ORPHAN_NOTIFICATION = ({ type, table, eventName }) =>
  `(notifications.type = '${type}' AND NOT EXISTS (SELECT 1 FROM ${table} x WHERE x.notificationId = notifications.notificationId)${
    eventName === undefined
      ? ''
      : ` AND ${EVENT_EXISTS('notification', eventName, idJson('notificationId', 'notifications.notificationId'))}`
  })`;

export const dryRunSql = () =>
  `SELECT (SELECT COUNT(*) FROM posts p WHERE ${
    targetPostCondition('p')
  }) AS posts, (SELECT COUNT(*) FROM remote_posts WHERE ${
    IN_TARGETS('postId')
  }) AS remote_posts, (SELECT COUNT(*) FROM timeline_items WHERE deletedAt IS NULL AND ${
    IN_TARGETS('postId')
  }) AS timeline_items, (SELECT COUNT(*) FROM federated_timeline_items WHERE ${
    IN_TARGETS('postId')
  }) AS federated_items, (SELECT COUNT(*) FROM reposts WHERE ${
    IN_TARGETS('postId')
  }) AS reposts, (SELECT COUNT(*) FROM likes WHERE ${
    IN_TARGETS('postId')
  }) AS likes, (SELECT COUNT(*) FROM emoji_reacts WHERE ${
    IN_TARGETS('postId')
  }) AS emoji_reacts, ((SELECT COUNT(*) FROM notification_likes WHERE ${
    IN_TARGETS('likedPostId')
  }) + (SELECT COUNT(*) FROM notification_emoji_reacts WHERE ${
    IN_TARGETS('reactedPostId')
  }) + (SELECT COUNT(*) FROM notification_replies WHERE ${REPLY_TARGET}) + (SELECT COUNT(*) FROM notification_mentions WHERE ${
    IN_TARGETS('mentionPostId')
  }) + (SELECT COUNT(*) FROM notification_reposts WHERE ${
    IN_TARGETS('repostedPostId')
  })) AS notifications, (SELECT COUNT(*) FROM notifications WHERE ${
    ORPHAN_NOTIFICATION({ type: 'repost', table: 'notification_reposts' })
  }) AS orphan_repost_notifications, (SELECT COUNT(*) FROM post_images WHERE ${
    IN_TARGETS('postId')
  }) AS images, (SELECT COUNT(*) FROM posts p WHERE ${domainPostCondition('p')} AND ${
    ARTICLE_ROOT('p')
  }) AS articles_skipped, (SELECT COUNT(*) FROM actors a WHERE ${
    targetActorCondition('a')
  }) AS actors, (SELECT COUNT(*) FROM follows f WHERE EXISTS (SELECT 1 FROM local_actors la WHERE la.actorId = f.followerId) AND f.followingId IN (SELECT a.actorId FROM actors a WHERE ${
    targetActorCondition('a')
  })) AS follows_out, (SELECT COUNT(*) FROM follows f WHERE EXISTS (SELECT 1 FROM local_actors la WHERE la.actorId = f.followingId) AND f.followerId IN (SELECT a.actorId FROM actors a WHERE ${
    targetActorCondition('a')
  })) AS follows_in, (SELECT COUNT(*) FROM mutes m WHERE m.mutedActorId IN (SELECT a.actorId FROM actors a WHERE ${
    targetActorCondition('a')
  })) AS mutes`;

export const applySql = ({ now }) => [
  insertEvents({
    aggregateName: 'timelineItem',
    eventName: 'timelineItem.deleted',
    aggregateId: { key: 'timelineItemId', column: 't.timelineItemId' },
    payload: payloadJson('t', ['timelineItemId']),
    from: 'timeline_items t',
    where: `t.deletedAt IS NULL AND ${IN_TARGETS('t.postId')}`,
    now,
  }),
  `UPDATE timeline_items SET deletedAt = ${now} WHERE deletedAt IS NULL AND ${IN_TARGETS('postId')}`,
  notificationEvents({
    table: 'notification_likes',
    alias: 'nl',
    eventName: 'notification.likeNotificationDeleted',
    keys: ['notificationId', 'likerActorId', 'likedPostId'],
    where: IN_TARGETS('nl.likedPostId'),
    now,
  }),
  notificationEvents({
    table: 'notification_emoji_reacts',
    alias: 'ne',
    eventName: 'notification.emojiReactNotificationDeleted',
    keys: ['notificationId', 'reactorActorId', 'reactedPostId', 'emoji'],
    where: IN_TARGETS('ne.reactedPostId'),
    now,
  }),
  notificationEvents({
    table: 'notification_replies',
    alias: 'nr',
    eventName: 'notification.replyNotificationDeleted',
    keys: ['notificationId', 'replierActorId', 'replyPostId', 'originalPostId'],
    where: `(${IN_TARGETS('nr.replyPostId')} OR ${IN_TARGETS('nr.originalPostId')})`,
    now,
  }),
  notificationEvents({
    table: 'notification_mentions',
    alias: 'nm',
    eventName: 'notification.mentionNotificationDeleted',
    keys: ['notificationId', 'mentionerActorId', 'mentionPostId'],
    where: IN_TARGETS('nm.mentionPostId'),
    now,
  }),
  `DELETE FROM notification_likes WHERE ${IN_TARGETS('likedPostId')}`,
  `DELETE FROM notification_emoji_reacts WHERE ${IN_TARGETS('reactedPostId')}`,
  `DELETE FROM notification_replies WHERE ${REPLY_TARGET}`,
  `DELETE FROM notification_mentions WHERE ${IN_TARGETS('mentionPostId')}`,
  `DELETE FROM notification_reposts WHERE ${IN_TARGETS('repostedPostId')}`,
  `DELETE FROM notifications WHERE ${
    [
      ORPHAN_NOTIFICATION({
        type: 'like',
        table: 'notification_likes',
        eventName: 'notification.likeNotificationDeleted',
      }),
      ORPHAN_NOTIFICATION({
        type: 'emojiReact',
        table: 'notification_emoji_reacts',
        eventName: 'notification.emojiReactNotificationDeleted',
      }),
      ORPHAN_NOTIFICATION({
        type: 'reply',
        table: 'notification_replies',
        eventName: 'notification.replyNotificationDeleted',
      }),
      ORPHAN_NOTIFICATION({
        type: 'mention',
        table: 'notification_mentions',
        eventName: 'notification.mentionNotificationDeleted',
      }),
      ORPHAN_NOTIFICATION({ type: 'repost', table: 'notification_reposts' }),
    ].join(' OR ')
  }`,
  insertEvents({
    aggregateName: 'repost',
    eventName: 'repost.repostDeleted',
    aggregateId: { key: 'repostId', column: 'r.repostId' },
    payload: payloadJson('r', ['repostId']),
    from: 'reposts r',
    where: IN_TARGETS('r.postId'),
    now,
  }),
  `DELETE FROM reposts WHERE ${IN_TARGETS('postId')}`,
  insertEvents({
    aggregateName: 'like',
    eventName: 'like.localLikeDeleted',
    aggregateId: { key: 'likeId', column: 'l.likeId' },
    payload: payloadJson('l', ['likeId']),
    from: 'likes l',
    where: `l.type = 'local' AND ${IN_TARGETS('l.postId')}`,
    now,
  }),
  insertEvents({
    aggregateName: 'like',
    eventName: 'like.remoteLikeDeleted',
    aggregateId: { key: 'likeId', column: 'l.likeId' },
    payload: `json_object('likeId', l.likeId, 'likeActivityUri', rl.likeActivityUri)`,
    from: 'likes l JOIN remote_likes rl ON rl.likeId = l.likeId',
    where: `l.type = 'remote' AND ${IN_TARGETS('l.postId')}`,
    now,
  }),
  `DELETE FROM local_likes WHERE likeId IN (SELECT l.likeId FROM likes l WHERE ${IN_TARGETS('l.postId')})`,
  `DELETE FROM remote_likes WHERE likeId IN (SELECT l.likeId FROM likes l WHERE ${IN_TARGETS('l.postId')})`,
  `DELETE FROM likes WHERE ${IN_TARGETS('postId')}`,
  insertEvents({
    aggregateName: 'emojiReact',
    eventName: 'emojiReact.emojiReactDeleted',
    aggregateId: { key: 'emojiReactId', column: 'er.emojiReactId' },
    payload: payloadJson('er', ['emojiReactId', 'emojiReactActivityUri']),
    from: 'emoji_reacts er',
    where: IN_TARGETS('er.postId'),
    now,
  }),
  `DELETE FROM emoji_reacts WHERE ${IN_TARGETS('postId')}`,
  insertEvents({
    aggregateName: 'federatedTimelineItem',
    eventName: 'federatedTimelineItem.deleted',
    aggregateId: { key: 'federatedTimelineItemId', column: 'f.federatedTimelineItemId' },
    payload: payloadJson('f', ['federatedTimelineItemId']),
    from: 'federated_timeline_items f',
    where: IN_TARGETS('f.postId'),
    now,
  }),
  `DELETE FROM federated_timeline_items WHERE ${IN_TARGETS('postId')}`,
  `DELETE FROM post_images WHERE ${IN_TARGETS('postId')}`,
  `DELETE FROM post_quotes WHERE ${IN_TARGETS('postId')}`,
  `DELETE FROM remote_post_poll_votes WHERE ${IN_TARGETS('postId')}`,
  `DELETE FROM remote_post_polls WHERE ${IN_TARGETS('postId')}`,
  `DELETE FROM local_posts WHERE ${IN_TARGETS('postId')}`,
  `DELETE FROM remote_post_recipients WHERE ${IN_TARGETS('postId')}`,
  `DELETE FROM direct_post_participants WHERE ${IN_TARGETS('postId')}`,
  `DELETE FROM remote_posts WHERE ${IN_TARGETS('postId')}`,
  insertEvents({
    aggregateName: 'post',
    eventName: 'post.deleted',
    aggregateId: 'p.postId',
    aggregateIdIsText: true,
    payload: `json_object('postId', p.postId, 'deletedAt', ${now})`,
    from: 'posts p',
    where: targetPostCondition('p'),
    now,
  }),
  `DELETE FROM posts WHERE ${IN_TARGETS('postId')}`,
];
export const applyCountSql = (now) =>
  `SELECT (SELECT COUNT(*) FROM domain_events WHERE aggregateName = 'post' AND eventName = 'post.deleted' AND occurredAt = ${now}) AS deleted_posts, (SELECT COUNT(*) FROM timeline_items WHERE deletedAt = ${now}) AS deleted_timeline_items`;

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
const DRY_RUN_KEYS = [
  'posts',
  'remote_posts',
  'timeline_items',
  'federated_items',
  'reposts',
  'likes',
  'emoji_reacts',
  'notifications',
  'orphan_repost_notifications',
  'images',
  'articles_skipped',
  'actors',
  'follows_out',
  'follows_in',
  'mutes',
];

export const deleteBlockedDomainPosts = async ({
  env,
  mode,
  signal,
  fetchRequest = fetch,
  notice = defaultNotice,
  now = Date.now(),
}) => {
  if (!['dry-run', 'apply'].includes(mode)) throw fail('delete-posts', 'config-invalid', 'Invalid mode.');
  if (env.IORI_ENVIRONMENT !== 'production') {
    throw fail('delete-posts', 'config-invalid', 'Deleting blocked domain posts requires production.');
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw fail('delete-posts', 'credentials-missing', 'Cloudflare credentials are required.');
  }
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) || !GENERATION.test(env.IORI_GENERATION ?? '')) {
    throw fail('delete-posts', 'config-invalid', 'Deleting blocked domain posts inputs are invalid.');
  }
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
    const [result] = await query('delete-posts-query', dryRunSql());
    const row = result?.results?.[0];
    const counts = DRY_RUN_KEYS.map((key) => `${key}=${count(row, key)}`).join(' ');
    notice(`IORI_NOTICE delete-blocked-domain-posts mode=dry-run domain=${TARGET_DOMAIN} ${counts}`);
    return;
  }
  await query('delete-posts-query', applySql({ now }).join(';\n'));
  const [result] = await query('delete-posts-query', applyCountSql(now));
  const row = result?.results?.[0];
  notice(
    `IORI_NOTICE delete-blocked-domain-posts mode=apply deleted_posts=${
      count(row, 'deleted_posts')
    } deleted_timeline_items=${count(row, 'deleted_timeline_items')}`,
  );
};
export const deleteFailureLines = (error) => operationFailureLines(error?.stage ?? 'delete-posts', error);
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  const mode = MODES[invocation.operation];
  if (mode === undefined) throw new Error('Invalid blocked domain post operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await deleteBlockedDomainPosts({ env: process.env, mode, signal });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => main(signal)).then(() => console.log('Blocked domain post operation completed.')).catch(
    (error) => {
      try {
        process.stderr.write(`${deleteFailureLines(error).join('\n')}\n`);
      } catch {}
      console.error('Blocked domain post operation failed; retain current state for reviewed recovery.');
      process.exitCode = 1;
    },
  );
}
