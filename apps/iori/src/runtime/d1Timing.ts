import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

export type D1CallRecord = Readonly<{
  startedAt: number;
  endedAt: number;
  statements: number;
  sqlMs: number | undefined;
}>;

export type D1TimingSummary = Readonly<{
  calls: number;
  statements: number;
  stages: number;
  busyMs: number;
  minMs: number;
  p50Ms: number;
  maxMs: number;
  sqlMs: number;
  sqlKnownCalls: number;
}>;

export type D1TimingCollector = Readonly<{
  record: (call: D1CallRecord) => void;
  snapshot: () => ReadonlyArray<D1CallRecord>;
}>;

export const createD1TimingCollector = (): D1TimingCollector => {
  const calls: D1CallRecord[] = [];
  return {
    record: (call) => {
      calls.push(call);
    },
    snapshot: () => calls.slice(),
  };
};

export const summarizeD1Calls = (calls: ReadonlyArray<D1CallRecord>): D1TimingSummary => {
  const byStart = calls.slice().sort((a, b) => a.startedAt - b.startedAt || a.endedAt - b.endedAt);
  let stages = 0;
  let busyMs = 0;
  let stageStart = 0;
  let stageEnd = 0;
  for (const call of byStart) {
    if (stages === 0 || call.startedAt >= stageEnd) {
      busyMs += stageEnd - stageStart;
      stages += 1;
      stageStart = call.startedAt;
      stageEnd = call.endedAt;
    } else if (call.endedAt > stageEnd) {
      stageEnd = call.endedAt;
    }
  }
  busyMs += stageEnd - stageStart;

  const durations = calls.map((call) => Math.max(0, call.endedAt - call.startedAt)).sort((a, b) => a - b);
  const known = calls.flatMap((call) => call.sqlMs === undefined ? [] : [call.sqlMs]);
  return {
    calls: calls.length,
    statements: calls.reduce((total, call) => total + call.statements, 0),
    stages,
    busyMs,
    minMs: durations[0] ?? 0,
    p50Ms: durations[Math.ceil(durations.length / 2) - 1] ?? 0,
    maxMs: durations[durations.length - 1] ?? 0,
    sqlMs: known.reduce((total, ms) => total + ms, 0),
    sqlKnownCalls: known.length,
  };
};

export type D1TimedRoute =
  | 'statuses_create'
  | 'favourite'
  | 'unfavourite'
  | 'verify_credentials'
  | 'timelines_home'
  | 'notifications'
  | 'favourites_list';

const timedGetRoutes: Readonly<Record<string, D1TimedRoute>> = {
  '/api/v1/accounts/verify_credentials': 'verify_credentials',
  '/api/v1/timelines/home': 'timelines_home',
  '/api/v1/notifications': 'notifications',
  '/api/v1/favourites': 'favourites_list',
};

export const d1TimedRouteOf = (method: string, pathname: string): D1TimedRoute | undefined => {
  if (method === 'GET') return Object.hasOwn(timedGetRoutes, pathname) ? timedGetRoutes[pathname] : undefined;
  if (method !== 'POST') return undefined;
  if (pathname === '/api/v1/statuses') return 'statuses_create';
  if (/^\/api\/v1\/statuses\/[^/]+\/favourite$/.test(pathname)) return 'favourite';
  if (/^\/api\/v1\/statuses\/[^/]+\/unfavourite$/.test(pathname)) return 'unfavourite';
  return undefined;
};

export const d1TimingLogLine = (route: D1TimedRoute, status: number, summary: D1TimingSummary): string =>
  JSON.stringify({
    event: 'd1_timing',
    route,
    status,
    calls: summary.calls,
    statements: summary.statements,
    stages: summary.stages,
    busyMs: summary.busyMs,
    minMs: summary.minMs,
    p50Ms: summary.p50Ms,
    maxMs: summary.maxMs,
    sqlMs: summary.sqlMs,
    sqlKnownCalls: summary.sqlKnownCalls,
  });

export const logD1Timing = (
  collector: D1TimingCollector,
  request: Request,
  response: Response,
): void => {
  try {
    const route = d1TimedRouteOf(request.method, new URL(request.url).pathname);
    if (route === undefined) return;
    console.log(d1TimingLogLine(route, response.status, summarizeD1Calls(collector.snapshot())));
  } catch {
    return;
  }
};

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const durationOfResult = (result: unknown): number | undefined => {
  if (typeof result !== 'object' || result === null) return undefined;
  const meta: unknown = Reflect.get(result, 'meta');
  if (typeof meta !== 'object' || meta === null) return undefined;
  return numberOrUndefined(Reflect.get(meta, 'duration'));
};

const durationOfBatch = (results: unknown): number | undefined => {
  if (!Array.isArray(results)) return undefined;
  const known = results.flatMap((result) => {
    const duration = durationOfResult(result);
    return duration === undefined ? [] : [duration];
  });
  return known.length === 0 ? undefined : known.reduce((total, ms) => total + ms, 0);
};

const durationOfExec = (result: unknown): number | undefined =>
  typeof result === 'object' && result !== null ? numberOrUndefined(Reflect.get(result, 'duration')) : undefined;

const measure = async <T>(
  collector: D1TimingCollector,
  statements: number,
  run: () => Promise<T>,
  sqlMsOf: (result: T) => number | undefined,
): Promise<T> => {
  const startedAt = Date.now();
  const note = (sqlMs: () => number | undefined) => {
    try {
      collector.record({ startedAt, endedAt: Date.now(), statements, sqlMs: sqlMs() });
    } catch {
      return;
    }
  };
  let result: T;
  try {
    result = await run();
  } catch (error) {
    note(() => undefined);
    throw error;
  }
  note(() => sqlMsOf(result));
  return result;
};

export const instrumentD1 = (db: D1Database, collector: D1TimingCollector): D1Database => {
  const originals = new WeakMap<object, D1PreparedStatement>();

  const wrapStatement = (original: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = {
      bind: (...values: unknown[]) => wrapStatement(original.bind(...values)),
      first: (...args: unknown[]) =>
        measure(collector, 1, () => Reflect.apply(original.first, original, args) as Promise<unknown>, () => undefined),
      all: () => measure(collector, 1, () => original.all(), durationOfResult),
      run: () => measure(collector, 1, () => original.run(), durationOfResult),
      raw: (...args: unknown[]) =>
        measure(collector, 1, () => Reflect.apply(original.raw, original, args) as Promise<unknown>, () => undefined),
    } as unknown as D1PreparedStatement;
    originals.set(wrapped, original);
    return wrapped;
  };

  const prepare = (query: string) => wrapStatement(db.prepare(query));
  const batch = (statements: ReadonlyArray<D1PreparedStatement>) =>
    measure(
      collector,
      statements.length,
      () => db.batch(statements.map((statement) => originals.get(statement) ?? statement)),
      durationOfBatch,
    );
  const exec = (query: string) => measure(collector, 1, () => db.exec(query), durationOfExec);

  return new Proxy(db, {
    get: (target, key) => {
      if (key === 'prepare') return prepare;
      if (key === 'batch') return batch;
      if (key === 'exec') return exec;
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

export const instrumentEnvD1 = <E extends Readonly<{ DB: D1Database }>>(env: E, collector: D1TimingCollector): E => {
  try {
    if (env.DB === undefined || env.DB === null) return env;
    return { ...env, DB: instrumentD1(env.DB, collector) };
  } catch {
    return env;
  }
};
