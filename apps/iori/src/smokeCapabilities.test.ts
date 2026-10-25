import { expect, it, vi } from 'vitest';

import { isReviewedSmokeSelect, readOnlySmokeEnvironment } from './smokeCapabilities.ts';
it('permits generated reads and rejects SQL side effects and unsupported syntax', () => {
  for (
    const sql of [
      'SELECT 1 AS ok',
      'select "user_id", "username" from "users" where "users"."username" = ?',
      'select count(*) from "posts"',
    ]
  ) expect(isReviewedSmokeSelect(sql)).toBe(true);
  for (
    const sql of [
      'SELECT 1; DELETE FROM users',
      'SELECT load_extension(?)',
      'SELECT "load_extension"(?)',
      'WITH x AS (SELECT 1) SELECT * FROM x',
      'SELECT 1 -- comment',
      'SELECT 1 /* comment */',
      'DELETE FROM users',
      'SELECT * FROM "unknown"',
      'SELECT \';DELETE FROM users\'',
      'SELECT (SELECT 1)',
      'SELECT * FROM pragma_table_info(?)',
    ]
  ) expect(isReviewedSmokeSelect(sql)).toBe(false);
});
it('does not expose original bindings and denies every unreviewed operation', () => {
  const get = vi.fn();
  const put = vi.fn();
  const env = readOnlySmokeEnvironment(
    { DB: {}, UPLOADS: { get, put }, FEDIFY_KV: { get, put }, FEDIFY_QUEUE: { send: put } } as never,
  );
  expect(() => env.UPLOADS.put('key', '')).toThrow();
  expect(() => env.UPLOADS.delete('key')).toThrow();
  expect(() => env.UPLOADS.createMultipartUpload('key')).toThrow();
  expect(() => env.FEDIFY_KV.put('key', '')).toThrow();
  expect(() => env.FEDIFY_QUEUE.send({})).toThrow();
  expect(() => env.DB.exec('DELETE FROM users')).toThrow();
  env.UPLOADS.get('key');
  expect(get).toHaveBeenCalledOnce();
  expect(put).not.toHaveBeenCalled();
});
