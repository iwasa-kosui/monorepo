import { describe, expect, it } from 'vitest';

import { StatusSchema } from '../../mastodon/entities.ts';
import { idsOf, setupReadApi } from './helper/mastodonReadHarness.ts';

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

  it('作者本人には private の投稿を visibility: private で返す', async () => {
    const t = await seedLocalPosts();

    const response = await t.request(`/api/v1/statuses/${t.posts.private.postId}`, { headers: t.me.bearer });

    expect(response.status).toBe(200);
    expect(StatusSchema.parse(await response.json())).toMatchObject({
      id: t.posts.private.postId,
      visibility: 'private',
    });
  });
});

describe('ローカルの投稿の公開範囲: GET /api/v1/statuses/:id/context', () => {
  it('未認証では private の起点を 404 にし、private の返信を子孫に含めない', async () => {
    const t = await seedLocalPosts();
    const publicReply = t.seed.addLocalPost(t.me, 4_000, { inReplyToUri: t.posts.public.uri, visibility: 'public' });
    const unlistedReply = t.seed.addLocalPost(t.me, 4_100, {
      inReplyToUri: t.posts.public.uri,
      visibility: 'unlisted',
    });
    t.seed.addLocalPost(t.me, 4_200, { inReplyToUri: t.posts.public.uri, visibility: 'private' });

    const [anonymous, owner, hidden] = await Promise.all([
      t.request(`/api/v1/statuses/${t.posts.public.postId}/context`),
      t.request(`/api/v1/statuses/${t.posts.public.postId}/context`, { headers: t.me.bearer }),
      t.request(`/api/v1/statuses/${t.posts.private.postId}/context`),
    ]);

    const descendantsOf = async (response: Response) =>
      ((await response.json()) as { descendants: unknown[] }).descendants.map((item) => StatusSchema.parse(item).id);
    expect(await descendantsOf(anonymous)).toEqual([publicReply.postId, unlistedReply.postId]);
    expect(await descendantsOf(owner)).toHaveLength(3);
    expect(hidden.status).toBe(404);
  });

  it('未認証では private の祖先を含めない', async () => {
    const t = await seedLocalPosts();
    const reply = t.seed.addLocalPost(t.me, 4_000, { inReplyToUri: t.posts.private.uri, visibility: 'public' });

    const response = await t.request(`/api/v1/statuses/${reply.postId}/context`);

    expect(((await response.json()) as { ancestors: unknown[] }).ancestors).toEqual([]);
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

describe('ローカルの投稿の公開範囲: GET /api/v1/timelines/public', () => {
  it('未認証では public の投稿だけを返し、unlisted と private を載せない', async () => {
    const t = await seedLocalPosts();

    const anonymous = await t.request('/api/v1/timelines/public');
    const owner = await t.request('/api/v1/timelines/public?local=true', { headers: t.me.bearer });

    expect(idsOf(await anonymous.json())).toEqual([t.posts.public.postId]);
    expect(idsOf(await owner.json())).toEqual([t.posts.public.postId]);
  });
});
