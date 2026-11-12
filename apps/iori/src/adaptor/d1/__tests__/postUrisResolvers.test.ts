import { describe, expect, it } from 'vitest';

import { createD1LocalPostUrisResolverByUris } from '../post/localPostUrisResolverByUris.ts';
import { createD1RemotePostUrisResolverByUris } from '../post/remotePostUrisResolverByUris.ts';
import { createMastodonSeed, SEED_ORIGIN } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const alice = seed.addRemoteActor('alice');
  return { fixture, seed, me, alice };
};

describe('D1 の保存済み URI の resolver', () => {
  it('リモートの投稿は、渡した URI のうち保存済みで削除されていないものを 1 回の問い合わせで返す', async () => {
    const t = setup();
    const first = t.seed.addRemotePost(t.alice, 1_000);
    const second = t.seed.addRemotePost(t.alice, 2_000);
    t.fixture.sqlite.prepare('UPDATE posts SET deletedAt = ? WHERE postId = ?').run(3_000, second.postId);
    const resolver = createD1RemotePostUrisResolverByUris(t.fixture.db);
    t.fixture.queries.length = 0;

    const resolved = await resolver.resolve({
      uris: [first.uri, second.uri, 'https://remote.example/notes/unknown'],
    });

    expect(t.fixture.queries).toHaveLength(1);
    expect(resolved).toEqual({ ok: true, val: [first.uri] });
  });

  it('リモートの投稿は、空の URI なら何も返す', async () => {
    const t = setup();

    const resolved = await createD1RemotePostUrisResolverByUris(t.fixture.db).resolve({ uris: [] });

    expect(resolved).toEqual({ ok: true, val: [] });
  });

  it('ローカルの投稿は、渡した URI のうち保存済みで削除されていないものを返す', async () => {
    const t = setup();
    const kept = t.seed.addLocalPost(t.me, 1_000);
    const deleted = t.seed.addLocalPost(t.me, 2_000, { deletedAt: 3_000 });
    const resolver = createD1LocalPostUrisResolverByUris(t.fixture.db, SEED_ORIGIN);
    t.fixture.queries.length = 0;

    const resolved = await resolver.resolve({
      uris: [
        kept.uri,
        deleted.uri,
        `${SEED_ORIGIN}/users/kosui/posts/00000000-0000-4000-8000-999999999999`,
        'https://remote.example/users/kosui/posts/other',
        'not a url',
      ],
    });

    expect(t.fixture.queries).toHaveLength(1);
    expect(resolved).toEqual({ ok: true, val: [kept.uri] });
  });
});
