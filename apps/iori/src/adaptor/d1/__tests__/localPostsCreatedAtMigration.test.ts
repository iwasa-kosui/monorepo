import { readdirSync, readFileSync } from 'node:fs';
import type { SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { PageRequest } from '../../../domain/page/page.ts';
import { localPostIdsPageQuery } from '../post/localPostsResolverByPage.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const migrationFile = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  .find((name) => name.includes('local_posts_created_at'));

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const postId = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

type SeedPost = { n: number; createdAt: number; visibility: string; deletedAt?: number };

const seedPosts: ReadonlyArray<SeedPost> = [
  { n: 1, createdAt: 3_000, visibility: 'public' },
  { n: 2, createdAt: 1_000, visibility: 'public' },
  { n: 3, createdAt: 2_000, visibility: 'unlisted' },
  { n: 4, createdAt: 3_000, visibility: 'public' },
  { n: 5, createdAt: 5_000, visibility: 'public', deletedAt: 6_000 },
  { n: 6, createdAt: 4_000, visibility: 'private' },
  { n: 7, createdAt: 2_500, visibility: 'public' },
];

const setupBeforeMigration = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  const kosui = createMastodonSeed(fixture).addLocalActor('kosui');
  sqlite.exec('DROP INDEX local_posts_visibility_created_at_post_id_idx');
  sqlite.exec('ALTER TABLE local_posts DROP COLUMN createdAt');
  for (const post of seedPosts) {
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type,deletedAt) VALUES (?,?,?,?,?,?)').run(
      postId(post.n),
      kosui.actorId,
      `post ${post.n}`,
      post.createdAt,
      'local',
      post.deletedAt ?? null,
    );
    sqlite.prepare('INSERT INTO local_posts(postId,userId,visibility) VALUES (?,?,?)').run(
      postId(post.n),
      kosui.userId,
      post.visibility,
    );
  }
  if (migrationFile === undefined) throw new Error('local_posts_created_at の migration が見つからない');
  sqlite.exec(readFileSync(new URL(migrationFile, migrationsDir), 'utf8'));
  return { ...fixture, kosui };
};

const page = (overrides: Partial<PageRequest>): PageRequest => ({
  limit: 2,
  olderThanId: undefined,
  newerThanId: undefined,
  order: 'newestFirst',
  ...overrides,
});

describe('local_posts.createdAt の migration', () => {
  it.each<{ name: string; mutedActorIds: ReadonlyArray<ActorId>; page: Partial<PageRequest> }>([
    {
      name: 'newestFirst、mutedActorIds あり、olderThanId あり',
      mutedActorIds: [ActorId.orThrow('00000000-0000-4000-8000-000000000001')],
      page: { olderThanId: postId(1) },
    },
    {
      name: 'oldestFirst、newerThanId あり、mutedActorIds なし',
      mutedActorIds: [],
      page: { newerThanId: postId(7), order: 'oldestFirst' },
    },
  ])(
    'resolver が作る SQL が local_posts_visibility_created_at_post_id_idx を使い、全件走査も一時ソートもしない: $name',
    (testCase) => {
      const t = setupBeforeMigration();

      const { sql, params } = localPostIdsPageQuery(t.db, {
        mutedActorIds: testCase.mutedActorIds,
        page: page(testCase.page),
      }).toSQL();
      const plan = t.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as SQLInputValue[])) as Array<
        { detail: string }
      >;
      const details = plan.map((row) => row.detail);

      expect(details.some((detail) => detail.includes('local_posts_visibility_created_at_post_id_idx'))).toBe(true);
      expect(details.some((detail) => detail.includes('SCAN local_posts'))).toBe(false);
      expect(details.some((detail) => detail.includes('USE TEMP B-TREE'))).toBe(false);
    },
  );
});
