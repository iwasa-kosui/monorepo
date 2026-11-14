import { describe, expect, it } from 'vitest';

import { StatusSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';

const notFound = { error: 'Record not found' };

const seedLocalPosts = async () => {
  const t = setupReadApi();
  const me = await t.signIn();
  const posts = {
    public: t.seed.addLocalPost(me, 1_000, { visibility: 'public' }),
    unlisted: t.seed.addLocalPost(me, 2_000, { visibility: 'unlisted' }),
    private: t.seed.addLocalPost(me, 3_000, { visibility: 'private' }),
  };
  return { ...t, me, posts };
};

describe('ローカルの投稿の公開範囲: GET /api/v1/statuses/:id', () => {
  it('未認証では public と unlisted の投稿をその公開範囲で返し、private は 404 にする', async () => {
    const t = await seedLocalPosts();

    const [publicResponse, unlistedResponse, privateResponse] = await Promise.all([
      t.request(`/api/v1/statuses/${t.posts.public.postId}`),
      t.request(`/api/v1/statuses/${t.posts.unlisted.postId}`),
      t.request(`/api/v1/statuses/${t.posts.private.postId}`),
    ]);

    expect(publicResponse.status).toBe(200);
    expect(StatusSchema.parse(await publicResponse.json()).visibility).toBe('public');
    expect(unlistedResponse.status).toBe(200);
    expect(StatusSchema.parse(await unlistedResponse.json()).visibility).toBe('unlisted');
    expect(privateResponse.status).toBe(404);
    expect(await privateResponse.json()).toEqual(notFound);
  });
});

describe('ローカルの投稿の公開範囲: GET /api/v1/accounts/:id/statuses', () => {
  it('未認証では private を除き、unlisted を visibility 付きで返し、作者本人には private も返す', async () => {
    const t = await seedLocalPosts();

    const anonymous = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses`);
    const owner = await t.request(`/api/v1/accounts/${t.me.actorId}/statuses`, { headers: t.me.bearer });

    const anonymousStatuses = ((await anonymous.json()) as unknown[]).map((item) => StatusSchema.parse(item));
    expect(anonymousStatuses.map((status) => [status.id, status.visibility])).toEqual([
      [t.posts.unlisted.postId, 'unlisted'],
      [t.posts.public.postId, 'public'],
    ]);
    const ownerStatuses = ((await owner.json()) as unknown[]).map((item) => StatusSchema.parse(item));
    expect(ownerStatuses.map((status) => [status.id, status.visibility])).toEqual([
      [t.posts.private.postId, 'private'],
      [t.posts.unlisted.postId, 'unlisted'],
      [t.posts.public.postId, 'public'],
    ]);
  });
});
