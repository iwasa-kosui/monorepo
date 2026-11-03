import { describe, expect, it } from 'vitest';

import { AccountSchema } from '../../mastodon/entities.ts';
import { idsOf, linkOf, setupReadApi } from './helper/mastodonReadHarness.ts';

describe('GET /api/v1/accounts/:id/followers と /following', () => {
  const seedFollows = async () => {
    const t = setupReadApi();
    const me = await t.signIn();
    const others = [1, 2, 3].map((n) => t.seed.addRemoteActor(`user${n}`));
    for (const other of others) {
      t.seed.addFollow(other.actorId, me.actorId);
      t.seed.addFollow(me.actorId, other.actorId);
    }
    const ids = others.map((other) => other.actorId).sort().reverse();
    return { ...t, me, others, ids };
  };

  it('未認証でもフォロワーとフォロー中を Account の配列で返す', async () => {
    const t = await seedFollows();

    const [followers, following] = await Promise.all([
      t.request(`/api/v1/accounts/${t.me.actorId}/followers`),
      t.request(`/api/v1/accounts/${t.me.actorId}/following`),
    ]);

    expect(followers.status).toBe(200);
    const body = await followers.json() as unknown[];
    expect(body.map((item) => AccountSchema.parse(item).id)).toEqual(t.ids);
    expect(AccountSchema.parse(body[0])).toMatchObject({ following_count: 1, followers_count: 1 });
    expect(idsOf(await following.json())).toEqual(t.ids);
  });

  it('limit と max_id と Link ヘッダーでページを送る', async () => {
    const t = await seedFollows();

    const first = await t.request(`/api/v1/accounts/${t.me.actorId}/followers?limit=2`);
    const next = linkOf(first, 'next');
    const second = await t.request(`${next?.pathname}${next?.search}`);

    expect(idsOf(await first.json())).toEqual(t.ids.slice(0, 2));
    expect(next?.searchParams.get('max_id')).toBe(t.ids[1]);
    expect(linkOf(first, 'prev')?.searchParams.get('min_id')).toBe(t.ids[0]);
    expect(idsOf(await second.json())).toEqual([t.ids[2]]);
  });

  it('要素がなければ Link を付けない', async () => {
    const t = await seedFollows();

    const lonely = t.seed.addRemoteActor('lonely');

    const response = await t.request(`/api/v1/accounts/${lonely.actorId}/following`);

    expect(await response.json()).toEqual([]);
    expect(response.headers.get('Link')).toBeNull();
  });

  it('存在しないアカウントと不正な ID は 404 にする', async () => {
    const t = await seedFollows();

    const responses = await Promise.all([
      t.request(`/api/v1/accounts/${t.seed.uuid()}/followers`),
      t.request('/api/v1/accounts/not-an-id/following'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(await responses[0]!.json()).toEqual({ error: 'Record not found' });
  });
});
