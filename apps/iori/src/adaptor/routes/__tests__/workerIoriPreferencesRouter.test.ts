import { describe, expect, it } from 'vitest';

import { setupReadApi } from './helper/mastodonReadHarness.ts';

const path = '/api/iori/v1/preferences';

const putPreferences = (headers: Record<string, string>, body: unknown, contentType = 'application/json') => ({
  method: 'PUT',
  headers: { 'Content-Type': contentType, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('iori の利用者設定 API', () => {
  it('GET は認証なしだと 401 にする', async () => {
    const t = setupReadApi();

    const response = await t.request(path);

    expect(response.status).toBe(401);
  });

  it('GET は read:accounts を満たさない scope のトークンを 403 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn('write:statuses');

    const response = await t.request(path, { headers: me.bearer });

    expect(response.status).toBe(403);
  });

  it('GET は行がなければ public を返す', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:accounts');

    const response = await t.request(path, { headers: me.bearer });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preferences: { defaultPostVisibility: 'public' } });
  });

  it('PUT は保存して、GET に反映する', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:accounts write:accounts');

    const saved = await t.request(path, putPreferences(me.bearer, { defaultPostVisibility: 'unlisted' }));
    const read = await t.request(path, { headers: me.bearer });

    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ preferences: { defaultPostVisibility: 'unlisted' } });
    expect(await read.json()).toEqual({ preferences: { defaultPostVisibility: 'unlisted' } });
  });

  it('PUT はフォームの値も受け付ける', async () => {
    const t = setupReadApi();
    const me = await t.signIn('write:accounts');

    const saved = await t.request(
      path,
      putPreferences(me.bearer, 'defaultPostVisibility=private', 'application/x-www-form-urlencoded'),
    );

    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ preferences: { defaultPostVisibility: 'private' } });
  });

  it.each([
    {},
    { defaultPostVisibility: 'direct' },
  ])('PUT は %j を 422 にする', async (body) => {
    const t = setupReadApi();
    const me = await t.signIn('write:accounts');

    const response = await t.request(path, putPreferences(me.bearer, body));

    expect(response.status).toBe(422);
    expect(t.sqlite.prepare('SELECT * FROM user_preferences').all()).toEqual([]);
  });
});
