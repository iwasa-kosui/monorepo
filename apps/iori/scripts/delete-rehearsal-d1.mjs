import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { controlPlaneApi, withReason } from './target-preparation-diagnostics.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';

export const REHEARSAL_DATABASES = Object.freeze([
  'iori-production-prdrehearse1',
  'iori-production-prdrehearse2',
  'iori-production-prdrehearse3',
  'iori-production-prdrehearse4',
  'iori-production-prdrehearse5',
]);
const REHEARSAL_NAME = /^iori-production-prdrehearse[1-5]$/;
if (!REHEARSAL_DATABASES.every((name) => REHEARSAL_NAME.test(name))) {
  throw new Error('Rehearsal database names are invalid.');
}
const API_ROOT = 'https://api.cloudflare.com/client/v4';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const MAX_BODY_BYTES = 2_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMPTY_CHECK_SQL = String
  .raw`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\_%' ESCAPE '\' AND name NOT LIKE '\_cf\_%' ESCAPE '\'`;

const request = async ({ method, path, body, token, signal, fetchRequest }) => {
  const api = controlPlaneApi(path);
  const failed = (reason) => withReason(new Error('Cloudflare request failed.'), signal?.aborted ? 'aborted' : reason);
  try {
    if (signal?.aborted) throw failed('aborted');
    const response = await fetchRequest(new URL(`${API_ROOT}${path}`), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw failed(
        response.status === 401 || response.status === 403 ? 'api-forbidden' : `${api}-http-${response.status}`,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw failed(`${api}-shape`);
    const chunks = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw failed(`${api}-too-large`);
      }
      chunks.push(item.value);
    }
    let parsed;
    try {
      parsed = JSON.parse(await new Blob(chunks).text());
    } catch {
      throw failed(`${api}-shape`);
    }
    if (parsed?.success !== true || parsed.result === undefined) throw failed(`${api}-shape`);
    return parsed;
  } catch (error) {
    if (error?.diagnostic) throw error;
    throw failed(`${api}-request`);
  }
};
const listDatabases = async (context) => {
  const path = `/accounts/${context.accountId}/d1/database`;
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await request({ ...context, method: 'GET', path: `${path}?per_page=${PAGE_SIZE}&page=${page}` });
    const info = body.result_info;
    if (!Array.isArray(body.result) || (info !== undefined && (info === null || typeof info !== 'object'))) {
      throw withReason(new Error('Cloudflare response is invalid.'), 'd1-shape');
    }
    items.push(...body.result);
    if (body.result.length === 0) return items;
    if (Number.isInteger(info?.total_pages)) {
      if (page >= info.total_pages) return items;
    } else if (Number.isInteger(info?.total_count)) {
      if (items.length >= info.total_count) return items;
    } else if (body.result.length < (info?.per_page ?? PAGE_SIZE)) return items;
  }
  throw withReason(new Error('Cloudflare response is too long.'), 'd1-limit');
};
const matchesOf = (items, name) =>
  items.filter((item) => item !== null && typeof item === 'object' && item.name === name);
const checkEmpty = async (context, name, uuid) => {
  const path = `/accounts/${context.accountId}/d1/database/${uuid}`;
  const detail = await request({ ...context, method: 'GET', path });
  if (detail.result === null || typeof detail.result !== 'object' || detail.result.name !== name) {
    throw withReason(new Error('Rehearsal D1 name does not match.'), 'identity-mismatch');
  }
  const queried = await request({ ...context, method: 'POST', path: `${path}/query`, body: { sql: EMPTY_CHECK_SQL } });
  return Array.isArray(queried.result) && queried.result[0]?.results?.length === 1
    && queried.result[0].results[0]?.n === 0;
};
const defaultNotice = (line) => process.stderr.write(`${line}\n`);
const incomplete = (failures) => Object.assign(new Error('Rehearsal D1 deletion incomplete.'), { failures });

export const deleteRehearsalD1 = async ({ env, signal, fetchRequest = fetch, notice = defaultNotice }) => {
  const failures = [];
  const fail = (stage, error) => failures.push({ stage, error });
  const state = (name, value) => notice(`IORI_NOTICE rehearsal-d1 name=${name} state=${value}`);
  if (env.IORI_ENVIRONMENT !== 'production') {
    throw incomplete([{
      stage: 'rehearsal-delete',
      error: withReason(new Error('Rehearsal D1 deletion requires production.'), 'config-invalid'),
    }]);
  }
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw incomplete([{
      stage: 'rehearsal-delete',
      error: withReason(new Error('Cloudflare credentials are required.'), 'credentials-missing'),
    }]);
  }
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID)) {
    throw incomplete([{
      stage: 'rehearsal-delete',
      error: withReason(new Error('Cloudflare credentials are invalid.'), 'config-invalid'),
    }]);
  }
  const context = {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    token: env.CLOUDFLARE_API_TOKEN,
    signal,
    fetchRequest,
  };
  let before;
  try {
    before = await listDatabases(context);
  } catch (error) {
    throw incomplete([{ stage: 'rehearsal-delete-list', error }]);
  }
  const found = REHEARSAL_DATABASES.map((name) => ({ name, matches: matchesOf(before, name) }));
  for (const { name, matches } of found) {
    state(name, matches.length === 0 ? 'absent' : matches.length === 1 ? 'present' : 'ambiguous');
  }
  const blocked = new Set();
  const removed = new Set();
  for (const { name, matches } of found) {
    if (matches.length === 0) continue;
    if (matches.length > 1) {
      blocked.add(name);
      fail(
        'rehearsal-delete-list',
        withReason(new Error('Rehearsal D1 name is ambiguous.'), 'resource-ambiguous'),
      );
      continue;
    }
    const uuid = matches[0].uuid;
    if (typeof uuid !== 'string' || !UUID.test(uuid)) {
      blocked.add(name);
      state(name, 'check-failed');
      fail('rehearsal-delete-check', withReason(new Error('Rehearsal D1 id is invalid.'), 'result-invalid'));
      continue;
    }
    let empty;
    try {
      empty = await checkEmpty(context, name, uuid);
    } catch (error) {
      blocked.add(name);
      state(name, 'check-failed');
      fail('rehearsal-delete-check', error);
      continue;
    }
    if (!empty) {
      blocked.add(name);
      state(name, 'not-empty');
      fail(
        'rehearsal-delete-check',
        withReason(new Error('Rehearsal D1 is not empty.'), 'rehearsal-d1-not-empty'),
      );
      continue;
    }
    state(name, 'empty');
    try {
      await request({ ...context, method: 'DELETE', path: `/accounts/${context.accountId}/d1/database/${uuid}` });
      removed.add(name);
    } catch (error) {
      blocked.add(name);
      state(name, 'delete-failed');
      fail('rehearsal-delete-remove', error);
    }
  }
  try {
    const after = await listDatabases(context);
    for (const { name, matches } of found) {
      if (matchesOf(after, name).length > 0) {
        state(name, 'remaining');
        if (!blocked.has(name)) {
          fail(
            'rehearsal-delete-verify',
            withReason(new Error('Rehearsal D1 remains.'), 'rehearsal-d1-remaining'),
          );
        }
      } else if (removed.has(name)) state(name, 'deleted');
      else if (matches.length === 0) state(name, 'absent');
    }
  } catch (error) {
    fail('rehearsal-delete-verify', error);
  }
  if (failures.length > 0) throw incomplete(failures);
};
export const rehearsalFailureLines = (error) => {
  const failures = Array.isArray(error?.failures)
    ? error.failures
    : [{ stage: 'rehearsal-delete', error }];
  return [...new Set(failures.flatMap((failure) => operationFailureLines(failure.stage, failure.error)))];
};
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  if (invocation.operation !== 'delete-rehearsal-d1') throw new Error('Invalid rehearsal D1 operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  await deleteRehearsalD1({ env: process.env, signal });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => main(signal)).then(() => console.log('Rehearsal D1 databases deleted.')).catch((error) => {
    try {
      process.stderr.write(`${rehearsalFailureLines(error).join('\n')}\n`);
    } catch {}
    console.error('Rehearsal D1 deletion failed; retain current state for reviewed recovery.');
    process.exitCode = 1;
  });
}
