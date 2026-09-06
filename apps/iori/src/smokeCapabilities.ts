import type { D1PreparedStatement } from '@cloudflare/workers-types';

import type { IoriWorkerEnv } from './workerEnv.ts';

const denied = (): never => {
  throw new Error('Smoke capability denied.');
};
const tables = new Set([
  'users',
  'actors',
  'local_actors',
  'keys',
  'instance_actor_keys',
  'posts',
  'local_posts',
  'remote_posts',
]);
const words = new Set([
  'select',
  'from',
  'left',
  'inner',
  'join',
  'on',
  'where',
  'and',
  'or',
  'is',
  'not',
  'null',
  'as',
  'asc',
  'desc',
  'order',
  'by',
  'limit',
  'offset',
  'count',
  'distinct',
  'in',
  'ok',
]);
/** Restricted grammar for Drizzle smoke reads. No comments, literals, CTEs, subqueries, SQL functions except count, or statement separators. */
export const isReviewedSmokeSelect = (sql: string) => {
  const tokens = sql.match(/"[a-zA-Z_][a-zA-Z0-9_]*"|[a-zA-Z_][a-zA-Z0-9_]*|\d+|[?.,()*=<>!]|\s+/g);
  if (!tokens || tokens.join('') !== sql) return false;
  const significant = tokens.filter((token) => !/^\s+$/.test(token)).map((token) => token.toLowerCase());
  if (significant[0] !== 'select' || significant.slice(1).includes('select')) return false;
  for (let index = 0; index < significant.length; index++) {
    const token = significant[index]!;
    if (/^[a-z]/.test(token) && !words.has(token)) return false;
    if (['from', 'join'].includes(token) && !tables.has(significant[index + 1]?.replaceAll('"', '') ?? '')) {
      return false;
    }
    if (
      significant[index + 1] === '(' && (/^[a-z"]/.test(token))
      && !['count', 'in', 'where', 'and', 'or', 'on'].includes(token)
    ) return false;
  }
  return significant.includes('from') || sql.toLowerCase() === 'select 1 as ok';
};
/** Proxy targets are empty facades: reflection cannot recover the original mutable binding. */
const facade = <T extends object>(binding: T, reads: ReadonlySet<string>): T =>
  new Proxy({} as T, {
    get: (_target, key) => {
      if (typeof key !== 'string' || !reads.has(key)) return denied;
      const method: unknown = Reflect.get(binding, key);
      return typeof method === 'function' ? method.bind(binding) : denied;
    },
    set: () => false,
  });
export const readOnlySmokeEnvironment = (env: IoriWorkerEnv): IoriWorkerEnv => {
  const statement = (source: D1PreparedStatement): D1PreparedStatement =>
    new Proxy({} as D1PreparedStatement, {
      get: (_target, key) => {
        if (key === 'bind') return (...values: unknown[]) => statement(source.bind(...values));
        if (key === 'first' || key === 'all' || key === 'raw') return source[key].bind(source);
        return denied;
      },
    });
  const DB = new Proxy({} as IoriWorkerEnv['DB'], {
    get: (_target, key) =>
      key === 'prepare'
        ? (query: string) => isReviewedSmokeSelect(query) ? statement(env.DB.prepare(query)) : denied()
        : denied,
  });
  return Object.freeze({
    ...env,
    DB,
    UPLOADS: facade(env.UPLOADS, new Set(['get', 'head', 'list'])),
    FEDIFY_KV: facade(env.FEDIFY_KV, new Set(['get', 'getWithMetadata', 'list'])),
    FEDIFY_QUEUE: facade(env.FEDIFY_QUEUE, new Set()),
  });
};
