import { afterEach, describe, expect, it } from 'vitest';

import { createD1PublicRemotePostIdsResolverByLocalFollows } from '../timeline/publicRemotePostIdsResolverByLocalFollows.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  return { ...fixture, seed: createMastodonSeed(fixture) };
};

describe('createD1PublicRemotePostIdsResolverByLocalFollows', () => {
  it('ローカルのアクターがフォローしているリモートのアクターの公開投稿だけを、新しい順に返す', async () => {
    const { db, seed, sqlite } = setup();
    const kosui = seed.addLocalActor('kosui');
    const alice = seed.addRemoteActor('alice');
    const bob = seed.addRemoteActor('bob');
    const stranger = seed.addRemoteActor('stranger');
    seed.addFollow(kosui.actorId, alice.actorId);
    seed.addFollow(kosui.actorId, bob.actorId);
    // リモートのアクターどうしのフォローは、ローカルのタイムラインには出ない
    seed.addFollow(bob.actorId, stranger.actorId);

    const older = seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const newer = seed.addRemotePost(bob, 2_000, { visibility: 'public' });
    seed.addRemotePost(alice, 3_000, { visibility: 'unlisted' });
    seed.addRemotePost(alice, 4_000, { visibility: 'private' });
    seed.addRemotePost(stranger, 5_000, { visibility: 'public' });
    const deleted = seed.addRemotePost(bob, 6_000, { visibility: 'public' });
    sqlite.prepare('UPDATE posts SET deletedAt = ? WHERE postId = ?').run(7_000, deleted.postId);

    const result = await createD1PublicRemotePostIdsResolverByLocalFollows(db).resolve({ limit: 10 });

    expect(result).toEqual({ ok: true, val: [newer.postId, older.postId] });
  });

  it('件数の上限を守る', async () => {
    const { db, seed } = setup();
    const kosui = seed.addLocalActor('kosui');
    const alice = seed.addRemoteActor('alice');
    seed.addFollow(kosui.actorId, alice.actorId);
    seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const newest = seed.addRemotePost(alice, 2_000, { visibility: 'public' });

    const result = await createD1PublicRemotePostIdsResolverByLocalFollows(db).resolve({ limit: 1 });

    expect(result).toEqual({ ok: true, val: [newest.postId] });
  });
});
