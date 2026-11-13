import { describe, expect, it } from 'vitest';

import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

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

  it('PUT は認証なしだと 401 にする', async () => {
    const t = setupReadApi();

    const response = await t.request(path, putPreferences({}, { defaultPostVisibility: 'private' }));

    expect(response.status).toBe(401);
  });

  it('GET は read:accounts を満たさない scope のトークンを 403 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn('write:statuses');

    const response = await t.request(path, { headers: me.bearer });

    expect(response.status).toBe(403);
  });

  it('PUT は write:accounts を満たさない scope のトークンを 403 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:accounts');

    const response = await t.request(path, putPreferences(me.bearer, { defaultPostVisibility: 'private' }));

    expect(response.status).toBe(403);
  });

  it('GET は Cookie でも Bearer でも読める', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:accounts');

    const withCookie = await t.request(path, { headers: { Cookie: `sessionId=${me.sessionId}` } });
    const withBearer = await t.request(path, { headers: me.bearer });

    expect(withCookie.status).toBe(200);
    expect(withBearer.status).toBe(200);
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

  it('PUT は 2 回目に createdAt を保ち、値と updatedAt を更新し、イベントを 2 件書く', async () => {
    const t = setupReadApi();
    const me = await t.signIn('write:accounts');

    await t.request(path, putPreferences(me.bearer, { defaultPostVisibility: 'unlisted' }));
    const first = t.sqlite.prepare('SELECT defaultPostVisibility, createdAt, updatedAt FROM user_preferences')
      .get() as {
        defaultPostVisibility: string;
        createdAt: number;
        updatedAt: number;
      };
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.request(path, putPreferences(me.bearer, { defaultPostVisibility: 'private' }));
    const second = t.sqlite.prepare('SELECT defaultPostVisibility, createdAt, updatedAt FROM user_preferences').all();

    expect(first.defaultPostVisibility).toBe('unlisted');
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ defaultPostVisibility: 'private', createdAt: first.createdAt });
    expect((second[0] as { updatedAt: number }).updatedAt).toBeGreaterThan(first.updatedAt);
    expect(
      t.sqlite.prepare('SELECT eventName FROM domain_events WHERE eventName LIKE \'userPreferences.%\'').all(),
    ).toEqual([{ eventName: 'userPreferences.saved' }, { eventName: 'userPreferences.saved' }]);
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
    { defaultPostVisibility: 'everyone' },
    { defaultPostVisibility: 1 },
    { defaultPostVisibility: null },
  ])('PUT は %j を 422 にする', async (body) => {
    const t = setupReadApi();
    const me = await t.signIn('write:accounts');

    const response = await t.request(path, putPreferences(me.bearer, body));

    expect(response.status).toBe(422);
    expect(t.sqlite.prepare('SELECT * FROM user_preferences').all()).toEqual([]);
  });

  it('PUT は Cookie のとき Origin がなければ 403 にし、同じ Origin があれば保存する', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:accounts');
    const cookie = { Cookie: `sessionId=${me.sessionId}` };

    const withoutOrigin = await t.request(path, putPreferences(cookie, { defaultPostVisibility: 'private' }));
    const withOrigin = await t.request(
      path,
      putPreferences({ ...cookie, Origin: ORIGIN }, { defaultPostVisibility: 'private' }),
    );

    expect(withoutOrigin.status).toBe(403);
    expect(withOrigin.status).toBe(200);
    expect(await withOrigin.json()).toEqual({ preferences: { defaultPostVisibility: 'private' } });
  });

  it('他人の設定は読み書きしない', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:accounts write:accounts');
    const other = t.seed.addLocalActor('other');
    t.sqlite.prepare('INSERT INTO user_preferences(userId,defaultPostVisibility,createdAt,updatedAt) VALUES (?,?,?,?)')
      .run(other.userId, 'private', 1_000, 1_000);

    const read = await t.request(path, { headers: me.bearer });
    await t.request(path, putPreferences(me.bearer, { defaultPostVisibility: 'unlisted' }));

    expect(await read.json()).toEqual({ preferences: { defaultPostVisibility: 'public' } });
    expect(
      t.sqlite.prepare('SELECT defaultPostVisibility FROM user_preferences WHERE userId = ?').get(other.userId),
    ).toEqual({ defaultPostVisibility: 'private' });
  });
});
