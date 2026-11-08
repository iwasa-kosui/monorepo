import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { fail, GENERATION, openD1Query } from './move-unfollowed-reposts.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';

const DAY_MS = 86_400_000;
export const ARCHIVE_AGE_MS = 7 * DAY_MS;
const DAILY_WINDOW_DAYS = 30;
const EVENT_NAME_LIMIT = 30;
const ROW_BYTES =
  'length(CAST(eventId AS BLOB)) + length(CAST(aggregateId AS BLOB)) + length(CAST(aggregateName AS BLOB)) + length(CAST(eventName AS BLOB)) + COALESCE(length(CAST(aggregateState AS BLOB)), 0) + COALESCE(length(CAST(eventPayload AS BLOB)), 0) + 8';
const CREATED_AT_SKEW_ACTORS =
  `(SELECT COUNT(*) FROM (SELECT MIN(e.occurredAt) AS first_at, MIN(CASE WHEN e.eventName = 'actor.created' THEN e.occurredAt END) AS created_at FROM actors a LEFT JOIN domain_events e ON e.aggregateId IN (a.actorId, '"' || a.actorId || '"') GROUP BY a.actorId) WHERE created_at IS NULL OR first_at < created_at)`;

export const summarySql = (now) =>
  `SELECT COUNT(*) AS total, MIN(occurredAt) AS oldest, MAX(occurredAt) AS newest, COALESCE(SUM(CASE WHEN occurredAt < ${
    now - ARCHIVE_AGE_MS
  } THEN 1 ELSE 0 END), 0) AS older_than_archive_age, AVG(${ROW_BYTES}) AS avg_bytes, MAX(${ROW_BYTES}) AS max_bytes, ${CREATED_AT_SKEW_ACTORS} AS created_at_skew_actors FROM domain_events`;
export const dailySql = (now) =>
  `SELECT strftime('%Y-%m-%d', occurredAt / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM domain_events WHERE occurredAt >= ${
    Math.floor(now / DAY_MS) * DAY_MS - (DAILY_WINDOW_DAYS - 1) * DAY_MS
  } GROUP BY day ORDER BY day`;
export const eventNameSql = () =>
  `SELECT eventName, COUNT(*) AS n FROM domain_events GROUP BY eventName ORDER BY n DESC, eventName LIMIT ${EVENT_NAME_LIMIT}`;
export const statsStatements = (now) => [summarySql(now), dailySql(now), eventNameSql()];

const defaultNotice = (line) => process.stderr.write(`${line}\n`);
const defaultOutput = (text) => process.stdout.write(`${text}\n`);
const invalid = () => fail('events-stats-query', 'result-invalid', 'D1 query result is invalid.');
const integer = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
};
const nullableInteger = (value) => value === null ? null : integer(value);
const iso = (ms) => ms === null ? null : new Date(ms).toISOString();
const rowsOf = (result) => {
  if (!Array.isArray(result?.results)) throw invalid();
  return result.results;
};

export const buildStats = ({ results, now }) => {
  if (!Array.isArray(results) || results.length !== 3) throw invalid();
  const [summary] = rowsOf(results[0]);
  if (summary === undefined) throw invalid();
  const total = integer(summary.total);
  const oldest = nullableInteger(summary.oldest);
  const newest = nullableInteger(summary.newest);
  const avgBytes = summary.avg_bytes === null ? null : Number(summary.avg_bytes);
  if (avgBytes !== null && !Number.isFinite(avgBytes)) throw invalid();
  return {
    generatedAt: new Date(now).toISOString(),
    total,
    oldestOccurredAt: iso(oldest),
    newestOccurredAt: iso(newest),
    olderThanArchiveAge: {
      days: ARCHIVE_AGE_MS / DAY_MS,
      cutoffOccurredAt: new Date(now - ARCHIVE_AGE_MS).toISOString(),
      count: integer(summary.older_than_archive_age),
    },
    dailyCounts: rowsOf(results[1]).map((row) => {
      if (typeof row.day !== 'string') throw invalid();
      return { day: row.day, count: integer(row.n) };
    }),
    eventNameCounts: rowsOf(results[2]).map((row) => {
      if (typeof row.eventName !== 'string') throw invalid();
      return { eventName: row.eventName, count: integer(row.n) };
    }),
    rowBytes: {
      average: avgBytes === null ? null : Math.round(avgBytes),
      max: nullableInteger(summary.max_bytes),
    },
    createdAtSkewActors: integer(summary.created_at_skew_actors),
  };
};

export const noticeLines = (stats) => [
  `IORI_NOTICE domain-events-stats summary total=${stats.total} oldest=${stats.oldestOccurredAt ?? 'none'} newest=${
    stats.newestOccurredAt ?? 'none'
  } older_than_7d=${stats.olderThanArchiveAge.count} avg_bytes=${stats.rowBytes.average ?? 0} max_bytes=${
    stats.rowBytes.max ?? 0
  } created_at_skew_actors=${stats.createdAtSkewActors}`,
  ...stats.dailyCounts.map((item) => `IORI_NOTICE domain-events-stats day=${item.day} count=${item.count}`),
  ...stats.eventNameCounts.map((item) => `IORI_NOTICE domain-events-stats event=${item.eventName} count=${item.count}`),
];

export const domainEventsStats = async ({
  env,
  signal,
  fetchRequest = fetch,
  notice = defaultNotice,
  output = defaultOutput,
  now = Date.now(),
}) => {
  if (env.IORI_ENVIRONMENT !== 'production') {
    throw fail('events-stats', 'config-invalid', 'Domain event statistics require production.');
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw fail('events-stats', 'credentials-missing', 'Cloudflare credentials are required.');
  }
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) || !GENERATION.test(env.IORI_GENERATION ?? '')) {
    throw fail('events-stats', 'config-invalid', 'Domain event statistics inputs are invalid.');
  }
  const { query } = await openD1Query({ env, signal, fetchRequest, prefix: 'events-stats' });
  const results = await query('events-stats-query', statsStatements(now).join(';\n'));
  const stats = buildStats({ results, now });
  output(JSON.stringify(stats));
  for (const line of noticeLines(stats)) notice(line);
};
export const statsFailureLines = (error) => operationFailureLines(error?.stage ?? 'events-stats', error);
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  if (invocation.operation !== 'domain-events-stats') throw new Error('Invalid domain event statistics operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await domainEventsStats({ env: process.env, signal });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => main(signal)).then(() => console.log('Domain event statistics completed.')).catch(
    (error) => {
      try {
        process.stderr.write(`${statsFailureLines(error).join('\n')}\n`);
      } catch {}
      console.error('Domain event statistics failed.');
      process.exitCode = 1;
    },
  );
}
