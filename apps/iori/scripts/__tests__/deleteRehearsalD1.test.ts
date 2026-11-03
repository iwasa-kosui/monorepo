import { describe, expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { deleteRehearsalD1, REHEARSAL_DATABASES, rehearsalFailureLines } from '../delete-rehearsal-d1.mjs';
import { OPERATION_STAGES } from '../operation-diagnostics.mjs';

const accountId = 'b'.repeat(32);
const token = 'api-token-value-for-fixture-0123456789';
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`;
const uuidOf = (name: string) => {
  const digit = name.slice(-1).replace(/[^0-9]/, 'a');
  return `${digit.repeat(8)}-1111-4111-8111-${digit.repeat(12)}`;
};
const productionNames = [
  'iori-production-prd20261102a',
  'iori-production-prd20261101a',
  'iori-production-prd20261031a',
  'iori',
];
const lookalikeNames = [
  'iori-production-prdrehearse6',
  'iori-production-prdrehearse1-x',
  'iori-production-prdrehearse',
];
const otherUuid = (index: number) => `${String(index).repeat(8)}-2222-4222-8222-${String(index).repeat(12)}`;
const database = (name: string, uuid = uuidOf(name)) => ({ name, uuid, file_size: 8192, num_tables: 0 });
const env = (overrides: Record<string, string> = {}) => ({
  IORI_ENVIRONMENT: 'production',
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: token,
  ...overrides,
});
type Call = { method: string; url: string; body?: string; init: RequestInit };
type Options = {
  initial?: { name: string; uuid: string }[];
  tableCount?: Record<string, unknown>;
  detailName?: Record<string, string>;
  deleteStatus?: Record<string, number>;
  keepAfterDelete?: string[];
  pageSize?: number;
};
const json = (result: unknown, extra: Record<string, unknown> = {}, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, errors: [], messages: [], result, ...extra }), { status });
const run = async (overrides: Record<string, string> = {}, options: Options = {}) => {
  const state = [...(options.initial ?? REHEARSAL_DATABASES.map(name => database(name)))];
  const calls: Call[] = [];
  const notices: string[] = [];
  const fetchRequest = async (url: URL, init: RequestInit) => {
    const method = String(init.method);
    const text = url.toString();
    calls.push({ method, url: text, body: init.body as string | undefined, init });
    if (text.startsWith(`${base}?`)) {
      const params = url.searchParams;
      const size = options.pageSize ?? 100;
      const page = Number(params.get('page'));
      expect(params.get('per_page')).toBe('100');
      const slice = state.slice((page - 1) * size, page * size);
      return json(slice, {
        result_info: { page, per_page: size, count: slice.length, total_count: state.length },
      });
    }
    const uuid = /\/d1\/database\/([0-9a-f-]{36})(?:\/query)?$/.exec(text)?.[1];
    const found = state.find(item => item.uuid === uuid);
    if (method === 'GET' && found) {
      return json({ ...found, name: options.detailName?.[found.name] ?? found.name });
    }
    if (method === 'POST' && found && text.endsWith('/query')) {
      const n = Object.hasOwn(options.tableCount ?? {}, found.name) ? options.tableCount![found.name] : 0;
      return json([{ results: [{ n }], success: true, meta: {} }]);
    }
    if (method === 'DELETE' && found) {
      const status = options.deleteStatus?.[found.name] ?? 200;
      if (status !== 200) return json(null, { errors: [{ code: 10000 }] }, status);
      if (!options.keepAfterDelete?.includes(found.name)) state.splice(state.indexOf(found), 1);
      return json(null);
    }
    return json(null, {}, 404);
  };
  let error: unknown;
  try {
    await deleteRehearsalD1({
      env: overrides.__none === undefined ? env(overrides) : {},
      fetchRequest: fetchRequest as never,
      notice: line => notices.push(line),
    });
  } catch (caught) {
    error = caught;
  }
  return { calls, notices, error, state };
};
const deletes = (calls: Call[]) => calls.filter(call => call.method === 'DELETE');
const queries = (calls: Call[]) => calls.filter(call => call.method === 'POST');
const diag = (stage: string, reason: string) =>
  `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;
const urlsOf = (calls: Call[]) => calls.map(call => call.url);
const uuidsOf = (names: string[]) => names.map(uuidOf);

describe('delete-rehearsal-d1', () => {
  it('fixes the five rehearsal names', () => {
    expect(REHEARSAL_DATABASES).toEqual([
      'iori-production-prdrehearse1',
      'iori-production-prdrehearse2',
      'iori-production-prdrehearse3',
      'iori-production-prdrehearse4',
      'iori-production-prdrehearse5',
    ]);
    expect(Object.isFrozen(REHEARSAL_DATABASES)).toBe(true);
  });
  it('deletes five empty databases by their own id and succeeds when the list no longer has them', async () => {
    const { calls, notices, error, state } = await run();
    expect(error).toBeUndefined();
    expect(state).toEqual([]);
    expect(urlsOf(deletes(calls))).toEqual(REHEARSAL_DATABASES.map(name => `${base}/${uuidOf(name)}`));
    expect(queries(calls)).toHaveLength(5);
    for (const call of queries(calls)) {
      const sql = JSON.parse(call.body!).sql as string;
      expect(sql).toBe(
        'SELECT COUNT(*) AS n FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite\\_%\' ESCAPE \'\\\' AND name NOT LIKE \'\\_cf\\_%\' ESCAPE \'\\\'',
      );
    }
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
      expect(call.init.redirect).toBe('error');
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(notices.filter(line => line.endsWith('state=deleted'))).toHaveLength(5);
    expect(notices.slice(0, 5)).toEqual(
      REHEARSAL_DATABASES.map(name => `IORI_NOTICE rehearsal-d1 name=${name} state=present`),
    );
  });
  it('reads every page of the list', async () => {
    const filler = Array.from({ length: 3 }, (_, index) => database(`other-${index}`, otherUuid(index + 3)));
    const { calls, error, state } = await run({}, {
      pageSize: 2,
      initial: [...filler, ...REHEARSAL_DATABASES.map(name => database(name))],
    });
    expect(error).toBeUndefined();
    expect(state).toHaveLength(3);
    expect(urlsOf(deletes(calls))).toHaveLength(5);
    expect(calls.filter(call => call.method === 'GET' && call.url.includes('page=4')).length).toBeGreaterThan(0);
  });
  it('never queries or deletes production databases or lookalike names mixed into the list', async () => {
    const others = [...productionNames, ...lookalikeNames].map((name, index) => database(name, otherUuid(index + 1)));
    const { calls, error, state } = await run({}, {
      initial: [...others, ...REHEARSAL_DATABASES.map(name => database(name))],
    });
    expect(error).toBeUndefined();
    expect(state).toEqual(others);
    const touched = [...deletes(calls), ...queries(calls)].map(call => call.url);
    for (const other of others) expect(calls.filter(call => call.url.includes(other.uuid))).toEqual([]);
    expect(touched).toHaveLength(10);
    expect(urlsOf(deletes(calls))).toEqual(REHEARSAL_DATABASES.map(name => `${base}/${uuidOf(name)}`));
  });
  it('does nothing to the API but listing when only production databases and lookalikes exist', async () => {
    const others = [...productionNames, ...lookalikeNames].map((name, index) => database(name, otherUuid(index + 1)));
    const { calls, error, notices } = await run({}, { initial: others });
    expect(error).toBeUndefined();
    expect([...deletes(calls), ...queries(calls)]).toEqual([]);
    expect(calls.every(call => call.method === 'GET' && call.url.startsWith(`${base}?`))).toBe(true);
    expect(notices.every(line => line.endsWith('state=absent'))).toBe(true);
  });
  it('skips absent databases and succeeds', async () => {
    const present = REHEARSAL_DATABASES.slice(0, 3);
    const { calls, notices, error } = await run({}, { initial: present.map(name => database(name)) });
    expect(error).toBeUndefined();
    expect(urlsOf(deletes(calls))).toEqual(present.map(name => `${base}/${uuidOf(name)}`));
    expect(notices).toContain('IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse4 state=absent');
    expect(notices).toContain('IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse5 state=absent');
  });
  it('succeeds without any change when everything is already absent', async () => {
    const { calls, error } = await run({}, { initial: [] });
    expect(error).toBeUndefined();
    expect(calls.every(call => call.method === 'GET')).toBe(true);
  });
  it.each([
    ['a table', 1],
    ['many tables', 12],
    ['a missing count', undefined],
    ['a text count', '0'],
    ['a null count', null],
  ])('keeps a database with %s and fails after deleting the others', async (_label, tableCount) => {
    const target = REHEARSAL_DATABASES[1];
    const { calls, error, state, notices } = await run({}, { tableCount: { [target]: tableCount } });
    expect(deletes(calls).map(call => call.url)).toEqual(
      uuidsOf(REHEARSAL_DATABASES.filter(name => name !== target)).map(uuid => `${base}/${uuid}`),
    );
    expect(state.map(item => item.name)).toEqual([target]);
    expect(notices).toContain(`IORI_NOTICE rehearsal-d1 name=${target} state=not-empty`);
    expect(notices).toContain(`IORI_NOTICE rehearsal-d1 name=${target} state=remaining`);
    expect(rehearsalFailureLines(error)).toEqual([
      diag('rehearsal-delete-check', 'rehearsal-d1-not-empty'),
    ]);
  });
  it('keeps a database whose query result has no rows', async () => {
    const target = REHEARSAL_DATABASES[0];
    const calls: Call[] = [];
    const state = REHEARSAL_DATABASES.map(name => database(name));
    let error: unknown;
    try {
      await deleteRehearsalD1({
        env: env(),
        notice: () => {},
        fetchRequest: (async (url: URL, init: RequestInit) => {
          const text = url.toString();
          calls.push({ method: String(init.method), url: text, init });
          if (text.startsWith(`${base}?`)) {
            return json(state, {
              result_info: { page: 1, per_page: 100, count: state.length, total_count: state.length },
            });
          }
          const found = state.find(item => text.includes(item.uuid))!;
          if (init.method === 'GET') return json(found);
          if (init.method === 'POST') {
            return json(found.name === target ? [{ results: [] }] : [{ results: [{ n: 0 }] }]);
          }
          state.splice(state.indexOf(found), 1);
          return json(null);
        }) as never,
      });
    } catch (caught) {
      error = caught;
    }
    expect(deletes(calls).map(call => call.url)).not.toContain(`${base}/${uuidOf(target)}`);
    expect(deletes(calls)).toHaveLength(4);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete-check', 'rehearsal-d1-not-empty')]);
  });
  it('continues with the other databases and ends in failure when one delete returns 403', async () => {
    const target = REHEARSAL_DATABASES[2];
    const { calls, error, notices, state } = await run({}, { deleteStatus: { [target]: 403 } });
    expect(deletes(calls)).toHaveLength(5);
    expect(state.map(item => item.name)).toEqual([target]);
    expect(notices).toContain(`IORI_NOTICE rehearsal-d1 name=${target} state=delete-failed`);
    expect(notices).toContain(`IORI_NOTICE rehearsal-d1 name=${target} state=remaining`);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete-remove', 'api-forbidden')]);
  });
  it('reports api-failed style reasons for a server error on delete', async () => {
    const target = REHEARSAL_DATABASES[4];
    const { error } = await run({}, { deleteStatus: { [target]: 500 } });
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete-remove', 'd1-http-500')]);
  });
  it('fails when a deleted database still appears in the list', async () => {
    const target = REHEARSAL_DATABASES[3];
    const { calls, error, notices } = await run({}, { keepAfterDelete: [target] });
    expect(deletes(calls)).toHaveLength(5);
    expect(notices).toContain(`IORI_NOTICE rehearsal-d1 name=${target} state=remaining`);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete-verify', 'rehearsal-d1-remaining')]);
  });
  it('deletes nothing for a name that appears twice and deletes the rest', async () => {
    const target = REHEARSAL_DATABASES[0];
    const duplicate = database(target, otherUuid(7));
    const { calls, error, state, notices } = await run({}, {
      initial: [...REHEARSAL_DATABASES.map(name => database(name)), duplicate],
    });
    expect(urlsOf(deletes(calls))).toEqual(REHEARSAL_DATABASES.slice(1).map(name => `${base}/${uuidOf(name)}`));
    expect(calls.filter(call => call.url.includes(duplicate.uuid) || call.url.includes(uuidOf(target)))).toEqual([]);
    expect(state.map(item => item.name)).toEqual([target, target]);
    expect(notices).toContain(`IORI_NOTICE rehearsal-d1 name=${target} state=ambiguous`);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete-list', 'resource-ambiguous')]);
  });
  it('does not delete a database whose detail name differs from the target', async () => {
    const target = REHEARSAL_DATABASES[1];
    const { calls, error, state } = await run({}, { detailName: { [target]: 'iori-production-prd20261102a' } });
    expect(urlsOf(deletes(calls))).not.toContain(`${base}/${uuidOf(target)}`);
    expect(queries(calls).map(call => call.url)).not.toContain(`${base}/${uuidOf(target)}/query`);
    expect(deletes(calls)).toHaveLength(4);
    expect(state.map(item => item.name)).toEqual([target]);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete-check', 'identity-mismatch')]);
  });
  it('does not delete a database whose list entry has no valid id', async () => {
    const target = REHEARSAL_DATABASES[1];
    const { calls, error } = await run({}, {
      initial: REHEARSAL_DATABASES.map(name => name === target ? { name, uuid: '../../x' } : database(name)),
    });
    expect(deletes(calls)).toHaveLength(4);
    expect(calls.some(call => call.url.includes('..'))).toBe(false);
    expect(rehearsalFailureLines(error)).toContain(diag('rehearsal-delete-check', 'result-invalid'));
  });
  it.each(['staging', '', 'development'])('fails without calling the API for the environment %j', async (value) => {
    const { calls, error } = await run({ IORI_ENVIRONMENT: value });
    expect(calls).toEqual([]);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete', 'config-invalid')]);
  });
  it('fails without calling the API when the environment is missing', async () => {
    const { calls, error } = await run({ __none: '1' });
    expect(calls).toEqual([]);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete', 'config-invalid')]);
  });
  it.each([
    ['CLOUDFLARE_ACCOUNT_ID', '', 'credentials-missing'],
    ['CLOUDFLARE_API_TOKEN', '', 'credentials-missing'],
    ['CLOUDFLARE_ACCOUNT_ID', 'not-hex', 'config-invalid'],
    ['CLOUDFLARE_ACCOUNT_ID', 'B'.repeat(32), 'config-invalid'],
  ])('rejects %s=%j before any request', async (name, value, reason) => {
    const { calls, error } = await run({ [name]: value });
    expect(calls).toEqual([]);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete', reason)]);
  });
  it('fails at the list stage without any delete when the list is forbidden', async () => {
    const calls: string[] = [];
    let error: unknown;
    try {
      await deleteRehearsalD1({
        env: env(),
        notice: () => {},
        fetchRequest: (async (url: URL, init: RequestInit) => {
          calls.push(`${init.method} ${url}`);
          return json(null, {}, 403);
        }) as never,
      });
    } catch (caught) {
      error = caught;
    }
    expect(calls).toHaveLength(1);
    expect(rehearsalFailureLines(error)).toEqual([diag('rehearsal-delete-list', 'api-forbidden')]);
  });
  it.each([
    ['not JSON', () => new Response('<html>')],
    ['success false', () => new Response(JSON.stringify({ success: false, result: [] }))],
    ['too large', () => new Response('x'.repeat(2_000_001))],
  ])('stops without any delete when the list response is %s', async (_label, respond) => {
    const calls: string[] = [];
    let error: unknown;
    try {
      await deleteRehearsalD1({
        env: env(),
        notice: () => {},
        fetchRequest: (async (url: URL, init: RequestInit) => {
          calls.push(`${init.method} ${url}`);
          return respond();
        }) as never,
      });
    } catch (caught) {
      error = caught;
    }
    expect(calls).toHaveLength(1);
    expect(rehearsalFailureLines(error)).toHaveLength(1);
    expect(rehearsalFailureLines(error)[0]).toMatch(/stage=rehearsal-delete-list .* reason=d1-(?:shape|too-large)$/);
  });
  it('keeps UUIDs, the token and the account id out of every public line', async () => {
    const scenarios = [
      await run(),
      await run({}, { deleteStatus: { [REHEARSAL_DATABASES[0]]: 403 }, tableCount: { [REHEARSAL_DATABASES[1]]: 3 } }),
      await run({ IORI_ENVIRONMENT: 'staging' }),
    ];
    for (const { notices, error } of scenarios) {
      const lines = [...notices, ...(error === undefined ? [] : rehearsalFailureLines(error))];
      for (const line of lines) {
        expect(assertWorkflowOutput(line)).toEqual([]);
        expect(line).not.toContain(token);
        expect(line).not.toContain(accountId);
        for (const name of REHEARSAL_DATABASES) expect(line).not.toContain(uuidOf(name));
        expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
        expect(line).not.toContain('file_size');
        expect(line).toMatch(
          /^(?:IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse[1-5] state=(?:present|absent|empty|not-empty|ambiguous|check-failed|deleted|delete-failed|remaining)|IORI_DIAG stage=[a-z-]{1,24} program=none exit=none signal=none reason=[a-z0-9-]{1,40})$/,
        );
      }
    }
  });
  it('uses only stages in the operation stage vocabulary', async () => {
    const { error } = await run({}, {
      deleteStatus: { [REHEARSAL_DATABASES[0]]: 403 },
      tableCount: { [REHEARSAL_DATABASES[1]]: 1 },
      keepAfterDelete: [REHEARSAL_DATABASES[2]],
    });
    const stages = rehearsalFailureLines(error).map(line => /stage=([a-z-]+)/.exec(line)![1]);
    expect(stages.sort()).toEqual(['rehearsal-delete-check', 'rehearsal-delete-remove', 'rehearsal-delete-verify']);
    for (const stage of stages) expect(OPERATION_STAGES).toContain(stage);
    for (const stage of ['rehearsal-delete', 'rehearsal-delete-list']) expect(OPERATION_STAGES).toContain(stage);
  });
});
