import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { createD1ActorIdsResolverByMentionQuery } from '../actor/actorIdsResolverByMentionQuery.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const viewer = seed.addLocalActor('kosui');
  const search = (username: string, host?: string, limit = 10) =>
    createD1ActorIdsResolverByMentionQuery(fixture.db).resolve({
      viewerActorId: ActorId.orThrow(viewer.actorId),
      username,
      host,
      limit,
    });
  return { seed, viewer, search };
};

describe('createD1ActorIdsResolverByMentionQuery', () => {
  it('フォロー中、フォロワー、ローカルの順に、ユーザー名の前方一致で候補を返す', async () => {
    const t = setup();
    const local = t.seed.addLocalActor('alfred');
    const follower = t.seed.addRemoteActor('alberta');
    const following = t.seed.addRemoteActor('albert');
    t.seed.addFollow(t.viewer.actorId, following.actorId);
    t.seed.addFollow(follower.actorId, t.viewer.actorId);

    expect(await t.search('al')).toEqual({
      ok: true,
      val: [following.actorId, follower.actorId, local.actorId],
    });
  });

  it('関係のないリモートのアカウントと、閲覧者自身は候補にしない', async () => {
    const t = setup();
    t.seed.addRemoteActor('kosuke');

    expect(await t.search('kos')).toEqual({ ok: true, val: [] });
  });

  it('ユーザー名が完全に一致する候補を先頭にする', async () => {
    const t = setup();
    const longer = t.seed.addRemoteActor('bobby');
    const exact = t.seed.addLocalActor('bob');
    t.seed.addFollow(t.viewer.actorId, longer.actorId);

    expect(await t.search('Bob')).toEqual({ ok: true, val: [exact.actorId, longer.actorId] });
  });

  it('ホストを与えたときはホストの前方一致で絞る', async () => {
    const t = setup();
    const here = t.seed.addRemoteActor('carol', 'mastodon.example');
    const there = t.seed.addRemoteActor('carol', 'misskey.example');
    t.seed.addFollow(t.viewer.actorId, here.actorId);
    t.seed.addFollow(t.viewer.actorId, there.actorId);

    expect(await t.search('carol', 'mis')).toEqual({ ok: true, val: [there.actorId] });
  });

  it('_ を LIKE のワイルドカードとして扱わない', async () => {
    const t = setup();
    const underscored = t.seed.addLocalActor('d_x');
    t.seed.addLocalActor('dax');

    expect(await t.search('d_')).toEqual({ ok: true, val: [underscored.actorId] });
  });

  it('上限の件数で切る', async () => {
    const t = setup();
    t.seed.addLocalActor('eve1');
    t.seed.addLocalActor('eve2');

    const result = await t.search('eve', undefined, 1);
    expect(result.ok && result.val.length).toBe(1);
  });
});
