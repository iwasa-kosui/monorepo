import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { selectVisiblePostIds } from '../post/visibleToViewer.ts';
import { createMastodonSeed, SEED_ORIGIN } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
const migrationFile = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  .find((name) => name.includes('remote_post_recipients'));

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setupBeforeMigration = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const kosui = seed.addLocalActor('kosui');
  const alice = seed.addRemoteActor('alice');
  const nullPost = seed.addRemotePost(alice, 1_000, { visibility: null });
  const publicPost = seed.addRemotePost(alice, 2_000, { visibility: 'public' });
  fixture.sqlite.exec('DROP TABLE remote_post_recipients');
  if (migrationFile === undefined) throw new Error('remote_post_recipients の migration が見つからない');
  fixture.sqlite.exec(readFileSync(new URL(migrationFile, migrationsDir), 'utf8'));
  return { ...fixture, seed, kosui, nullPost, publicPost };
};

describe('remote_post_recipients の migration', () => {
  it('visibility が null の投稿にだけ、その時点のローカルのアクターの URI を宛先として入れる', () => {
    const t = setupBeforeMigration();

    const rows = t.sqlite.prepare('SELECT postId, actorUri FROM remote_post_recipients').all();

    expect(rows).toEqual([{ postId: t.nullPost.postId, actorUri: `${SEED_ORIGIN}/users/kosui` }]);
  });

  it('宛先に入ったアクターには null の投稿が見え、あとから作ったフォローしていないアクターには見えない', async () => {
    const t = setupBeforeMigration();
    const hanako = t.seed.addLocalActor('hanako');
    const postIds = [PostId.orThrow(t.nullPost.postId)];

    const visibleToKosui = await selectVisiblePostIds(t.db, postIds, ActorId.orThrow(t.kosui.actorId));
    const visibleToHanako = await selectVisiblePostIds(t.db, postIds, ActorId.orThrow(hanako.actorId));

    expect([...visibleToKosui]).toEqual([t.nullPost.postId]);
    expect([...visibleToHanako]).toEqual([]);
  });
});
