import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { fail, GENERATION, openD1Query } from './move-unfollowed-reposts.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';

const DAY_MS = 86_400_000;
export const EMBEDDING_DIMENSIONS = 1024;
export const DIGEST_WINDOW_MS = 14 * DAY_MS;
export const CANDIDATE_WINDOW_MS = 72 * 3_600_000;
export const PAGE_SIZE = 200;
export const TOP1_HISTOGRAM = Object.freeze({ start: 0.2, step: 0.05, count: 12 });
export const GAP_HISTOGRAM = Object.freeze({ start: 0, step: 0.02, count: 10 });
export const CANDIDATE_THRESHOLDS = Object.freeze([0.4, 0.45, 0.5, 0.55, 0.6]);
export const MATERIAL_THRESHOLDS = Object.freeze([0.4, 0.5]);
const RECOMMENDABLE_KINDS = ['rss', 'hatena_hotentry', 'hatena_entrylist'];
const EPSILON = 1e-9;
const KEY = /^[A-Za-z0-9_.:-]{1,128}$/;
const HEX_LENGTH = EMBEDDING_DIMENSIONS * 8;
const HEX_COLUMN = (column) => `CASE WHEN ${column} IS NULL THEN NULL ELSE hex(${column}) END`;

export const topicsSql = () =>
  `SELECT userId, topicKey, enabled, embeddedAt IS NOT NULL AS embedded, ${
    HEX_COLUMN('embedding')
  } AS embedding FROM digest_topics ORDER BY userId, sortOrder, topicKey`;
export const itemsSql = (now) =>
  `SELECT d.userId AS userId, d.topicKey AS topicKey, ${
    HEX_COLUMN('e.embedding')
  } AS embedding FROM digests d JOIN digest_items i ON i.digestId = d.digestId LEFT JOIN feed_entries e ON e.feedEntryId = i.feedEntryId WHERE d.topicKey <> 'summary' AND d.createdAt >= ${
    now - DIGEST_WINDOW_MS
  }`;
const after = (column, cursor) => {
  if (cursor === undefined) return '';
  if (!KEY.test(cursor)) throw fail('digest-quality-query', 'cursor-invalid', 'D1 query cursor is invalid.');
  return ` AND ${column} > '${cursor}'`;
};
export const candidatesSql = (now, cursor) =>
  `SELECT e.feedEntryId AS feedEntryId, hex(e.embedding) AS embedding FROM feed_entries e JOIN feed_sources s ON s.feedSourceId = e.feedSourceId WHERE s.kind IN (${
    RECOMMENDABLE_KINDS.map((kind) => `'${kind}'`).join(', ')
  }) AND s.enabled = 1 AND e.embeddedAt IS NOT NULL AND e.embedding IS NOT NULL AND e.fetchedAt >= ${
    now - CANDIDATE_WINDOW_MS
  }${after('e.feedEntryId', cursor)} ORDER BY e.feedEntryId LIMIT ${PAGE_SIZE}`;
export const materialsSql = (cursor) =>
  `SELECT interestSourceId, userId, kind, hex(embedding) AS embedding FROM interest_sources WHERE deletedAt IS NULL AND embeddedAt IS NOT NULL AND embedding IS NOT NULL${
    after('interestSourceId', cursor)
  } ORDER BY interestSourceId LIMIT ${PAGE_SIZE}`;
export const baseStatements = (now) => [topicsSql(), itemsSql(now)];

const defaultNotice = (line) => process.stderr.write(`${line}\n`);
const defaultOutput = (text) => process.stdout.write(`${text}\n`);
const invalid = () => fail('digest-quality-query', 'result-invalid', 'D1 query result is invalid.');
const text = (value) => {
  if (typeof value !== 'string') throw invalid();
  return value;
};
const rowsOf = (result) => {
  if (!Array.isArray(result?.results)) throw invalid();
  return result.results;
};
const atLeast = (value, threshold) => value >= threshold - EPSILON;

export const hexToEmbedding = (hex) => {
  if (typeof hex !== 'string' || hex.length !== HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = Buffer.from(hex, 'hex');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const embedding = new Float32Array(EMBEDDING_DIMENSIONS);
  for (let index = 0; index < EMBEDDING_DIMENSIONS; index++) embedding[index] = view.getFloat32(index * 4, true);
  return embedding;
};

const norm = (vector) => {
  let sum = 0;
  for (let index = 0; index < vector.length; index++) sum += vector[index] * vector[index];
  return Math.sqrt(sum);
};
export const cosineSimilarity = (a, b) => {
  if (a.length !== b.length) return 0;
  const denominator = norm(a) * norm(b);
  if (denominator === 0) return 0;
  let dot = 0;
  for (let index = 0; index < a.length; index++) dot += a[index] * b[index];
  return dot / denominator;
};

export const rankTopics = (vector, topics) => {
  let first = null;
  let second = null;
  for (const topic of topics) {
    const entry = { topicKey: topic.topicKey, similarity: cosineSimilarity(vector, topic.vector) };
    if (first === null || entry.similarity > first.similarity) {
      second = first;
      first = entry;
    } else if (second === null || entry.similarity > second.similarity) second = entry;
  }
  if (first === null) return null;
  return { first, second, gap: second === null ? null : first.similarity - second.similarity };
};

export const histogram = (values, { start, step, count }) => {
  const buckets = new Array(count).fill(0);
  let below = 0;
  let atOrAbove = 0;
  for (const value of values) {
    if (value < start - EPSILON) below += 1;
    else {
      const index = Math.floor((value - start) / step + EPSILON);
      if (index >= count) atOrAbove += 1;
      else buckets[Math.max(0, index)] += 1;
    }
  }
  return { start, step, below, buckets, atOrAbove };
};

export const parseTopics = (rows) => {
  const byUser = new Map();
  for (const row of rows) {
    const userId = text(row.userId);
    const vector = hexToEmbedding(row.embedding);
    const topic = {
      topicKey: text(row.topicKey),
      enabled: Number(row.enabled) === 1,
      embedded: Number(row.embedded) === 1 && vector !== null,
      vector,
    };
    byUser.set(userId, [...(byUser.get(userId) ?? []), topic]);
  }
  return byUser;
};
const usableOf = (topicsByUser) =>
  new Map(
    [...topicsByUser].map(([userId, topics]) => [userId, topics.filter((topic) => topic.enabled && topic.embedded)]),
  );
const push = (map, key, value) => {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
};

export const scoreItems = (rows, topicsByUser, into = new Map()) => {
  const usable = usableOf(topicsByUser);
  for (const row of rows) {
    const userId = text(row.userId);
    const vector = hexToEmbedding(row.embedding);
    const ranked = vector === null ? null : rankTopics(vector, usable.get(userId) ?? []);
    const adopted = text(row.topicKey);
    push(into, userId, {
      first: ranked?.first ?? null,
      gap: ranked?.gap ?? null,
      matched: ranked === null ? null : ranked.first.topicKey === adopted,
    });
  }
  return into;
};
export const scoreCandidates = (rows, topicsByUser, into = new Map()) => {
  const usable = [...usableOf(topicsByUser)].filter(([, topics]) => topics.length > 0);
  for (const row of rows) {
    const vector = hexToEmbedding(row.embedding);
    if (vector === null) continue;
    for (const [userId, topics] of usable) {
      const ranked = rankTopics(vector, topics);
      push(into, userId, { similarity: ranked.first.similarity, gap: ranked.gap });
    }
  }
  return into;
};
export const scoreMaterials = (rows, topicsByUser, into = new Map()) => {
  const usable = usableOf(topicsByUser);
  for (const row of rows) {
    const userId = text(row.userId);
    const vector = hexToEmbedding(row.embedding);
    const ranked = vector === null ? null : rankTopics(vector, usable.get(userId) ?? []);
    push(into, userId, { kind: text(row.kind), similarity: ranked?.first.similarity ?? null });
  }
  return into;
};

const countAtLeast = (values, thresholds) =>
  Object.fromEntries(
    thresholds.map((threshold) => [threshold.toFixed(2), values.filter((v) => atLeast(v, threshold)).length]),
  );
const safeKind = (kind) => /^[a-z][a-z0-9_]{0,31}$/.test(String(kind)) ? String(kind) : 'other';
const kindsOf = (materials) => {
  const groups = new Map();
  for (const entry of materials) push(groups, safeKind(entry.kind), entry);
  return [...groups].map(([kind, entries]) => {
    const similarities = entries.filter((entry) => entry.similarity !== null).map((entry) => entry.similarity);
    const counts = countAtLeast(similarities, MATERIAL_THRESHOLDS);
    return { kind, total: entries.length, atLeast: counts };
  }).sort((a, b) => a.kind.localeCompare(b.kind));
};

export const buildReport = ({ now, topicsByUser, items, candidates, materials }) => {
  const userIds = [...new Set([...topicsByUser.keys(), ...items.keys(), ...materials.keys(), ...candidates.keys()])]
    .sort();
  return {
    generatedAt: new Date(now).toISOString(),
    users: userIds.map((userId, index) => {
      const topics = topicsByUser.get(userId) ?? [];
      const userItems = items.get(userId) ?? [];
      const scored = userItems.filter((entry) => entry.first !== null);
      const userCandidates = candidates.get(userId) ?? [];
      const userMaterials = materials.get(userId) ?? [];
      return {
        user: index + 1,
        topicCounts: {
          total: topics.length,
          enabled: topics.filter((topic) => topic.enabled).length,
          embedded: topics.filter((topic) => topic.enabled && topic.embedded).length,
        },
        items: {
          total: userItems.length,
          scored: scored.length,
          matched: scored.filter((entry) => entry.matched).length,
          top1Histogram: histogram(scored.map((entry) => entry.first.similarity), TOP1_HISTOGRAM),
          gapHistogram: histogram(
            scored.filter((entry) => entry.gap !== null).map((entry) => entry.gap),
            GAP_HISTOGRAM,
          ),
        },
        candidates: {
          total: userCandidates.length,
          atLeast: countAtLeast(userCandidates.map((entry) => entry.similarity), CANDIDATE_THRESHOLDS),
          top1Histogram: histogram(userCandidates.map((entry) => entry.similarity), TOP1_HISTOGRAM),
          gapHistogram: histogram(
            userCandidates.filter((entry) => entry.gap !== null).map((entry) => entry.gap),
            GAP_HISTOGRAM,
          ),
        },
        materials: {
          total: userMaterials.length,
          byKind: kindsOf(userMaterials),
        },
      };
    }),
  };
};

const digits = (value) => String(Math.max(0, Math.trunc(Number(value)) || 0));
const label = (prefix, value) => `${prefix}${Number(value).toFixed(2)}`;
const histogramLine = (user, name, hist) =>
  `IORI_NOTICE digest-quality-sample user=${digits(user)} hist=${name} ${
    [
      `${label('lt', hist.start)}=${digits(hist.below)}`,
      ...hist.buckets.map((n, index) => `${label('b', hist.start + index * hist.step)}=${digits(n)}`),
      `${label('ge', hist.start + hist.buckets.length * hist.step)}=${digits(hist.atOrAbove)}`,
    ].join(' ')
  }`;
const thresholdText = (counts, thresholds) =>
  thresholds.map((threshold) => `${label('ge', threshold)}=${digits(counts[threshold.toFixed(2)])}`).join(' ');

export const noticeLines = (report) => [
  `IORI_NOTICE digest-quality-sample overview users=${digits(report.users.length)}`,
  ...report.users.flatMap((user) => {
    const prefix = `IORI_NOTICE digest-quality-sample user=${digits(user.user)}`;
    const rate = user.items.scored === 0 ? 'none' : (user.items.matched / user.items.scored).toFixed(3);
    return [
      `${prefix} summary topics=${digits(user.topicCounts.total)} enabled=${
        digits(user.topicCounts.enabled)
      } embedded=${digits(user.topicCounts.embedded)} items=${digits(user.items.total)} scored=${
        digits(user.items.scored)
      } matched=${digits(user.items.matched)} match_rate=${rate}`,
      histogramLine(user.user, 'item_top1', user.items.top1Histogram),
      histogramLine(user.user, 'item_gap', user.items.gapHistogram),
      `${prefix} candidates total=${digits(user.candidates.total)} ${
        thresholdText(user.candidates.atLeast, CANDIDATE_THRESHOLDS)
      }`,
      ...user.materials.byKind.map((entry) =>
        `${prefix} material kind=${entry.kind} total=${digits(entry.total)} ${
          thresholdText(entry.atLeast, MATERIAL_THRESHOLDS)
        }`
      ),
    ];
  }),
];

const collect = async ({ query, sqlOf, score }) => {
  let cursor;
  for (;;) {
    const [result] = await query('digest-quality-query', sqlOf(cursor));
    const rows = rowsOf(result);
    score(rows);
    const last = rows.at(-1);
    if (rows.length < PAGE_SIZE || last === undefined) return;
    cursor = text(last.feedEntryId ?? last.interestSourceId);
  }
};

export const digestQualitySample = async ({
  env,
  signal,
  fetchRequest = fetch,
  notice = defaultNotice,
  output = defaultOutput,
  now = Date.now(),
}) => {
  if (env.IORI_ENVIRONMENT !== 'production') {
    throw fail('digest-quality', 'config-invalid', 'Digest quality sampling requires production.');
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw fail('digest-quality', 'credentials-missing', 'Cloudflare credentials are required.');
  }
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) || !GENERATION.test(env.IORI_GENERATION ?? '')) {
    throw fail('digest-quality', 'config-invalid', 'Digest quality sampling inputs are invalid.');
  }
  const { query } = await openD1Query({ env, signal, fetchRequest, prefix: 'digest-quality' });
  const base = await query('digest-quality-query', baseStatements(now).join(';\n'));
  if (base.length !== 2) throw invalid();
  const topicsByUser = parseTopics(rowsOf(base[0]));
  const items = scoreItems(rowsOf(base[1]), topicsByUser);
  const candidates = new Map();
  await collect({
    query,
    sqlOf: (cursor) => candidatesSql(now, cursor),
    score: (rows) => scoreCandidates(rows, topicsByUser, candidates),
  });
  const materials = new Map();
  await collect({
    query,
    sqlOf: (cursor) => materialsSql(cursor),
    score: (rows) => scoreMaterials(rows, topicsByUser, materials),
  });
  const report = buildReport({ now, topicsByUser, items, candidates, materials });
  output(JSON.stringify(report));
  for (const line of noticeLines(report)) notice(line);
};
export const sampleFailureLines = (error) => operationFailureLines(error?.stage ?? 'digest-quality', error);
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  if (invocation.operation !== 'digest-quality-sample') throw new Error('Invalid digest quality sample operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await digestQualitySample({ env: process.env, signal });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => main(signal)).then(() => console.log('Digest quality sample completed.')).catch(
    (error) => {
      try {
        process.stderr.write(`${sampleFailureLines(error).join('\n')}\n`);
      } catch {}
      console.error('Digest quality sample failed.');
      process.exitCode = 1;
    },
  );
}
