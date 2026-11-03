import { expect, it, vi } from 'vitest';

import { isReviewedSmokeSelect, readOnlySmokeEnvironment } from './smokeCapabilities.ts';
it('permits generated reads and rejects SQL side effects and unsupported syntax', () => {
  for (
    const sql of [
      'SELECT 1 AS ok',
      'select "user_id", "username" from "users" where "users"."username" = ?',
      'select count(*) from "posts"',
      'select "articleId", "title", "status" from "articles" where "articles"."articleId" = ? limit ?',
      'SELECT "a", "b" FROM "users", "actors"',
      'SELECT "a" FROM "users" LEFT JOIN "actors" ON "users"."id" = "actors"."id" AND "actors"."id" IN (?, ?) WHERE "a" IN (?, ?)',
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
      'INSERT INTO articles (articleId) VALUES (?)',
      'UPDATE articles SET status = ?',
      'DELETE FROM articles',
      'SELECT * FROM "unknown"',
      'SELECT \';DELETE FROM users\'',
      'SELECT (SELECT 1)',
      'SELECT * FROM pragma_table_info(?)',
      'SELECT * FROM "users", "sqlite_master"',
      'SELECT * FROM "users","sessions","user_passwords"',
      'SELECT * FROM "users" LEFT JOIN "actors" ON "users"."id" = "actors"."id", "sqlite_master"',
      'SELECT * FROM "users" AS "a", "pragma_database_list"',
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
