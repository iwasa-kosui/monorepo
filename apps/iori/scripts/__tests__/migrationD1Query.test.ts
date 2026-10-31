import { expect, it, vi } from 'vitest';

import { queryMigrationD1 } from '../migration-d1-import.mjs';
import { expectedTargetFixture } from './migrationTargetFixture.js';

const target = expectedTargetFixture();
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);
const query = (response: Response, apiToken = 'fixture-token') => {
  const fetchRequest = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response);
  return {
    fetchRequest,
    run: () => queryMigrationD1({ expectedTarget: target, apiToken, sql: 'SELECT 1', fetchRequest }),
  };
};

it('posts the statement to the target database with the bearer token and returns the rows', async () => {
  const { fetchRequest, run } = query(json({ success: true, result: [{ success: true, results: [{ count: 0 }] }] }));
  expect(await run()).toEqual([{ count: 0 }]);
  const [url, init] = fetchRequest.mock.calls[0]!;
  expect(url).toBe(
    `https://api.cloudflare.com/client/v4/accounts/${target.identity.account_id}/d1/database/${target.resources.d1.id}/query`,
  );
  expect(init!.method).toBe('POST');
  expect(init!.redirect).toBe('error');
  expect(new Headers(init!.headers).get('Authorization')).toBe('Bearer fixture-token');
  expect(JSON.parse(String(init!.body))).toEqual({ sql: 'SELECT 1', params: [] });
});
it('returns an empty list when the statement reports no results', async () => {
  const { run } = query(json({ success: true, result: [{ success: true }] }));
  expect(await run()).toEqual([]);
});
it('rejects a response larger than 64 KiB', async () => {
  const filler = 'x'.repeat(65537);
  const { run } = query(json({ success: true, result: [{ success: true, results: [{ filler }] }] }));
  await expect(run()).rejects.toThrow('D1 read exceeds bound.');
});
it('accepts a response of exactly 64 KiB', async () => {
  const head = '{"success":true,"result":[{"success":true,"results":[{"filler":"';
  const tail = '"}]}]}';
  const body = head + 'x'.repeat(65536 - head.length - tail.length) + tail;
  expect(Buffer.byteLength(body)).toBe(65536);
  const { run } = query(new Response(body));
  expect(await run()).toHaveLength(1);
});
it('rejects an HTTP failure', async () => {
  const { run } = query(json({ success: true, result: [{ success: true, results: [] }] }, { status: 500 }));
  await expect(run()).rejects.toThrow('D1 query failed.');
});
it.each([
  ['an unsuccessful envelope', { success: false, result: [{ success: true, results: [] }] }],
  ['an unsuccessful statement', { success: true, result: [{ success: false, results: [] }] }],
  ['several statement results', {
    success: true,
    result: [{ success: true, results: [] }, { success: true, results: [] }],
  }],
  ['no statement results', { success: true, result: [] }],
  ['a missing result', { success: true }],
])('rejects %s', async (_label, body) => {
  const { run } = query(json(body));
  await expect(run()).rejects.toThrow('D1 query failed.');
});
it('rejects a body that is not JSON', async () => {
  const { run } = query(new Response('not json'));
  await expect(run()).rejects.toThrow();
});
it('requires a credential before sending anything', async () => {
  const { fetchRequest, run } = query(json({}), '');
  await expect(run()).rejects.toThrow('D1 credential is required.');
  expect(fetchRequest).not.toHaveBeenCalled();
});
