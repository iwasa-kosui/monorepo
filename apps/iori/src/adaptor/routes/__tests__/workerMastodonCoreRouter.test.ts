import { Person, Update } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import type { LocalActor } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { UPLOAD_IMAGE_MAX_BYTES } from '../../../domain/image/uploadImage.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { User } from '../../../domain/user/user.ts';
import { Username } from '../../../domain/user/username.ts';
import { UpdateAvatarUseCase } from '../../../useCase/updateAvatar.ts';
import { UpdateProfileUseCase } from '../../../useCase/updateProfile.ts';
import {
  CredentialAccountSchema,
  ExtendedDescriptionSchema,
  InstanceV1Schema,
  InstanceV2Schema,
} from '../../mastodon/entities.ts';
import { createPostImageR2ObjectStore } from '../../r2/postImageObjectStore.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerMastodonCoreRouter } from '../workerMastodonCoreRouter.ts';
import { createWorkerMastodonFallbackRouter } from '../workerMastodonFallbackRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const setup = (
  { failUserResolve = false, translationEnabled = false }: { failUserResolve?: boolean; translationEnabled?: boolean } =
    {},
) => {
  const h = createOAuthHarness();
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: h.memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: h.memory.sessionResolver as never,
  });
  const actorId = ActorId.generate();
  const users = new Map<string, User>();
  const actors = new Map<string, LocalActor>();
  const addUser = (userId: string, username: string) => {
    const user = { id: userId, username: Username.orThrow(username) } as User;
    users.set(userId, user);
    actors.set(userId, {
      id: actorId,
      uri: `${ORIGIN}/users/${username}`,
      inboxUrl: `${ORIGIN}/users/${username}/inbox`,
      type: 'local',
      userId,
      logoUri: undefined,
    } as LocalActor);
  };
  const actorResolverByUserId = { resolve: (userId: string) => RA.ok(actors.get(userId)) } as never;
  const bucket = { put: vi.fn(async () => undefined), get: vi.fn() };
  const logoUriStored = vi.fn();
  const profileStored = vi.fn();
  const sendActivity = vi.fn(async (..._args: unknown[]) => undefined);
  const userUri = (identifier: string, suffix = '') => new URL(`${ORIGIN}/users/${identifier}${suffix}`);
  const ctx = {
    getActorUri: (identifier: string) => userUri(identifier),
    getInboxUri: (identifier?: string) =>
      identifier === undefined ? new URL(`${ORIGIN}/inbox`) : userUri(identifier, '/inbox'),
    getOutboxUri: (identifier: string) => userUri(identifier, '/outbox'),
    getFollowersUri: (identifier: string) => userUri(identifier, '/followers'),
    getActorKeyPairs: async () => [],
    sendActivity,
  };
  const userResolver = {
    resolve: (userId: string) => {
      if (failUserResolve) {
        throw new Error('boom');
      }
      return RA.ok(users.get(userId));
    },
  } as never;
  const router = createWorkerMastodonCoreRouter({
    authn,
    userResolver,
    userResolverByUsername: {
      resolve: (username: string) => RA.ok([...users.values()].find((user) => user.username === username)),
    } as never,
    actorResolverByUserId,
    updateProfileUseCase: UpdateProfileUseCase.create({
      userResolver,
      actorResolverByUserId,
      updateAvatarUseCase: UpdateAvatarUseCase.create({
        actorResolverByUserId,
        uploads: createPostImageR2ObjectStore({ bucket: bucket as never }),
        logoUriUpdatedStore: {
          store: async (event) => {
            logoUriStored(event);
            const actor = [...actors.values()].find((candidate) => candidate.id === event.aggregateId);
            if (actor !== undefined) actors.set(actor.userId, { ...actor, logoUri: event.aggregateState.logoUri });
            return RA.ok(undefined);
          },
        },
        origin: ORIGIN,
      }),
      localActorProfileUpdatedStore: {
        store: async (event) => {
          profileStored(event);
          const actor = [...actors.values()].find((candidate) => candidate.id === event.aggregateId);
          if (actor !== undefined) {
            actors.set(actor.userId, {
              ...actor,
              displayName: event.aggregateState.displayName,
              bio: event.aggregateState.bio,
            });
          }
          return RA.ok(undefined);
        },
      },
    }),
    createContext: () => ctx as never,
    accountStatsResolver: {
      resolve: () =>
        RA.ok({
          followersCount: 3,
          followingCount: 2,
          statusesCount: 5,
          createdAt: Date.UTC(2025, 0, 2, 3, 4, 5) as Instant,
          lastStatusAt: Date.UTC(2025, 5, 6) as Instant,
        }),
    } as never,
    instance: {
      domain: 'iori.test',
      title: 'iori.test',
      description: 'A microblog by kosui',
      contactUsername: Username.orThrow('kosui'),
      vapidPublicKey: 'vapid-key',
      translationEnabled,
    },
  });
  const app = createIoriApp({
    federationMiddleware: undefined,
    registerRoutes: (root) => {
      root.route('/api', router);
      root.route('/api', createWorkerMastodonFallbackRouter());
    },
    serveAsset: async () => undefined,
    serveUpload: async () => undefined,
    serveOgImage: async () => new Response('og', { status: 200 }),
  });
  const request = (path: string, init?: RequestInit) => app.request(`${ORIGIN}${path}`, init);
  return { ...h, addUser, request, app, bucket, logoUriStored, profileStored, sendActivity, actors };
};

describe('createWorkerMastodonCoreRouter', () => {
  describe('GET /api/v1/accounts/verify_credentials', () => {
    it('Bearer で CredentialAccount を返し、件数を D1 の集計から入れる', async () => {
      const h = setup();
      const { token, userId } = await h.issueUserToken('read:accounts');
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const body = CredentialAccountSchema.parse(await response.json());
      expect(body).toMatchObject({
        username: 'kosui',
        acct: 'kosui',
        followers_count: 3,
        following_count: 2,
        statuses_count: 5,
        created_at: '2025-01-02T03:04:05.000Z',
        last_status_at: '2025-06-06',
        avatar: `${ORIGIN}/default-avatar.png`,
        header: `${ORIGIN}/default-header.png`,
        indexable: false,
        hide_collections: null,
        source: {
          privacy: 'public',
          sensitive: false,
          language: null,
          note: '',
          fields: [],
          discoverable: null,
          indexable: false,
        },
      });
    });

    it('Cookie でも通る', async () => {
      const h = setup();
      const { sessionId, userId } = h.memory.addSession();
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Cookie: `sessionId=${sessionId}` },
      });

      expect(response.status).toBe(200);
      expect(CredentialAccountSchema.parse(await response.json()).username).toBe('kosui');
    });

    it('profile スコープだけでも通る', async () => {
      const h = setup();
      const { token, userId } = await h.issueUserToken('profile');
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
    });

    it('スコープが足りなければ 403 にする', async () => {
      const h = setup();
      const { token, userId } = await h.issueUserToken('read:statuses');
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'This action is outside the authorized scopes' });
    });

    it('例外が起きたら JSON の 500 を返す', async () => {
      const h = setup({ failUserResolve: true });
      const { token, userId } = await h.issueUserToken('read:accounts');
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({ error: 'Internal server error' });
    });

    it('認証がなければ 401 にする', async () => {
      const h = setup();

      const response = await h.request('/api/v1/accounts/verify_credentials');

      expect(response.status).toBe(401);
    });

    it('アプリのトークンだけでは 401 にする', async () => {
      const h = setup();
      const { token } = await h.issueAppToken('read');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/accounts/update_credentials', () => {
    const png = (size = 16) => {
      const bytes = new Uint8Array(size);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      return bytes;
    };
    const patch = (h: ReturnType<typeof setup>, token: string, values: Record<string, string | File>) => {
      const body = new FormData();
      for (const [key, value] of Object.entries(values)) body.set(key, value);
      return h.request('/api/v1/accounts/update_credentials', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
    };
    const setupUser = async (scope = 'write:accounts') => {
      const h = setup();
      const { token, userId } = await h.issueUserToken(scope);
      h.addUser(userId, 'kosui');
      return { h, token, userId };
    };

    it('avatar を R2 に保存して logoUri を更新し、更新後の CredentialAccount を返す', async () => {
      const { h, token, userId } = await setupUser('read:accounts write:accounts');

      const response = await patch(h, token, { avatar: new File([png()], 'a.png', { type: 'image/png' }) });

      expect(response.status).toBe(200);
      const body = CredentialAccountSchema.parse(await response.json());
      expect(body.avatar).toMatch(new RegExp(`^${ORIGIN}/uploads/[0-9a-f-]{36}\\.png$`));
      expect(body.avatar_static).toBe(body.avatar);
      expect(body.source).toMatchObject({ privacy: 'public', note: '' });
      expect(h.bucket.put).toHaveBeenCalledWith(
        expect.stringMatching(/^post-images\/[0-9a-f-]{36}\/original$/),
        expect.anything(),
        expect.objectContaining({ httpMetadata: expect.objectContaining({ contentType: 'image/png' }) }),
      );
      expect(h.actors.get(userId)?.logoUri).toBe(body.avatar);
      expect(h.logoUriStored).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'actor.logoUriUpdated',
          eventPayload: expect.objectContaining({ logoUri: body.avatar }),
        }),
      );
      const verified = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(await verified.json()).toMatchObject({ avatar: body.avatar });
    });

    it('申告の type が違っても、先頭のバイトで形式を決める', async () => {
      const { h, token } = await setupUser();

      const response = await patch(h, token, { avatar: new File([png()], 'a.gif', { type: 'image/gif' }) });

      expect(response.status).toBe(200);
      expect((await response.json() as { avatar: string }).avatar).toMatch(/\.png$/);
    });

    it.each([
      ['中身が画像でない', () => new File([new TextEncoder().encode('<html></html>')], 'a.png', { type: 'image/png' })],
      ['5MB を超える', () => new File([png(UPLOAD_IMAGE_MAX_BYTES + 1)], 'a.png', { type: 'image/png' })],
      ['空', () => new File([new Uint8Array()], 'a.png', { type: 'image/png' })],
    ])('avatar が%sなら 422 にして、何も保存しない', async (_name, file) => {
      const { h, token, userId } = await setupUser();

      const response = await patch(h, token, { avatar: file() });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: expect.stringContaining('Validation failed') });
      expect(h.bucket.put).not.toHaveBeenCalled();
      expect(h.logoUriStored).not.toHaveBeenCalled();
      expect(h.actors.get(userId)?.logoUri).toBeUndefined();
    });

    it('iori にない項目は受け付けて無視する', async () => {
      const { h, token } = await setupUser();

      const response = await patch(h, token, {
        locked: 'true',
        bot: 'true',
        discoverable: 'true',
        'fields_attributes[0][name]': 'web',
        'fields_attributes[0][value]': 'https://example.com',
        'source[privacy]': 'private',
      });

      expect(response.status).toBe(200);
      expect(CredentialAccountSchema.parse(await response.json())).toMatchObject({
        username: 'kosui',
        locked: false,
        bot: false,
        avatar: `${ORIGIN}/default-avatar.png`,
        header: `${ORIGIN}/default-header.png`,
        source: { privacy: 'public', note: '' },
      });
      expect(h.bucket.put).not.toHaveBeenCalled();
      expect(h.logoUriStored).not.toHaveBeenCalled();
      expect(h.profileStored).not.toHaveBeenCalled();
      expect(h.sendActivity).not.toHaveBeenCalled();
    });

    it('header が File なら 422 にして、何も保存しない', async () => {
      const { h, token } = await setupUser();

      const response = await patch(h, token, { header: new File([png()], 'h.png', { type: 'image/png' }) });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: expect.stringContaining('Validation failed') });
      expect(h.bucket.put).not.toHaveBeenCalled();
      expect(h.logoUriStored).not.toHaveBeenCalled();
    });

    it('display_name と note を保存し、verify_credentials と Account に出す', async () => {
      const { h, token, userId } = await setupUser('read:accounts write:accounts');

      const response = await patch(h, token, { display_name: '岩佐', note: 'こんにちは\nhttps://example.com' });

      expect(response.status).toBe(200);
      const body = CredentialAccountSchema.parse(await response.json());
      expect(body).toMatchObject({
        username: 'kosui',
        display_name: '岩佐',
        note: '<p>こんにちは<br><a href="https://example.com">https://example.com</a></p>',
        source: { note: 'こんにちは\nhttps://example.com' },
      });
      expect(h.actors.get(userId)).toMatchObject({ displayName: '岩佐', bio: 'こんにちは\nhttps://example.com' });
      expect(h.profileStored).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'actor.localProfileUpdated' }));
      const verified = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(await verified.json()).toMatchObject({
        display_name: '岩佐',
        source: { note: 'こんにちは\nhttps://example.com' },
      });
    });

    it('送らなかった項目は変えず、空文字を送った項目は未設定に戻す', async () => {
      const { h, token } = await setupUser('read:accounts write:accounts');
      await patch(h, token, { display_name: '岩佐', note: '自己紹介' });

      const onlyNote = await patch(h, token, { note: '' });

      expect(await onlyNote.json()).toMatchObject({ display_name: '岩佐', note: '', source: { note: '' } });
      const onlyName = await patch(h, token, { display_name: '' });
      expect(await onlyName.json()).toMatchObject({ display_name: 'kosui', note: '' });
    });

    it('display_name と note と avatar を同時に送れば、すべて反映して Update を 1 回だけ送る', async () => {
      const { h, token } = await setupUser();

      const response = await patch(h, token, {
        display_name: '岩佐',
        note: '自己紹介',
        avatar: new File([png()], 'a.png', { type: 'image/png' }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ display_name: '岩佐', source: { note: '自己紹介' } });
      expect(h.logoUriStored).toHaveBeenCalledTimes(1);
      expect(h.profileStored).toHaveBeenCalledTimes(1);
      expect(h.sendActivity).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['display_name が 31 文字', { display_name: 'あ'.repeat(31) }],
      ['note が 501 文字', { note: 'あ'.repeat(501) }],
    ])('%sなら 422 にして、avatar も含めて何も保存しない', async (_name, values) => {
      const { h, token, userId } = await setupUser();

      const response = await patch(h, token, {
        ...values,
        avatar: new File([png()], 'a.png', { type: 'image/png' }),
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: expect.stringContaining('Validation failed') });
      expect(h.bucket.put).not.toHaveBeenCalled();
      expect(h.logoUriStored).not.toHaveBeenCalled();
      expect(h.profileStored).not.toHaveBeenCalled();
      expect(h.sendActivity).not.toHaveBeenCalled();
      expect(h.actors.get(userId)?.displayName).toBeUndefined();
      expect(h.actors.get(userId)?.bio).toBeUndefined();
    });

    it('display_name が 30 文字、note が 500 文字ちょうどなら保存する', async () => {
      const { h, token } = await setupUser();

      const response = await patch(h, token, { display_name: 'あ'.repeat(30), note: 'あ'.repeat(500) });

      expect(response.status).toBe(200);
    });

    it('表示名・自己紹介・avatar のどれを更新しても、followers に Update(Person) を送る', async () => {
      const cases: ReadonlyArray<Record<string, string | File>> = [
        { display_name: '岩佐' },
        { note: '自己紹介' },
        { avatar: new File([png()], 'a.png', { type: 'image/png' }) },
      ];
      for (const values of cases) {
        const { h, token } = await setupUser();

        await patch(h, token, values);

        expect(h.sendActivity).toHaveBeenCalledTimes(1);
        const [sender, recipients, activity] = h.sendActivity.mock.calls[0] as unknown as [
          { identifier: string },
          string,
          Update,
        ];
        expect(sender).toEqual({ identifier: 'kosui' });
        expect(recipients).toBe('followers');
        expect(activity).toBeInstanceOf(Update);
        expect(activity.id?.href).toMatch(new RegExp(`^${ORIGIN}/users/kosui#updates/`));
        expect(await activity.getObject()).toBeInstanceOf(Person);
      }
    });

    it('Update の Person に、保存した name と summary と icon を入れる', async () => {
      const { h, token } = await setupUser();

      await patch(h, token, {
        display_name: '岩佐',
        note: '自己紹介',
        avatar: new File([png()], 'a.png', { type: 'image/png' }),
      });

      const activity = h.sendActivity.mock.calls[0]?.[2] as Update;
      const person = await activity.getObject() as Person;
      expect(person.name?.toString()).toBe('岩佐');
      expect(person.summary?.toString()).toBe('<p>自己紹介</p>');
      expect((await person.getIcon())?.url?.href).toMatch(new RegExp(`^${ORIGIN}/uploads/`));
    });

    it('avatar のキーがあるのに File でなければ 422 にして、何も保存しない', async () => {
      const { h, token } = await setupUser();

      const response = await patch(h, token, { avatar: 'not a file' });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: expect.stringContaining('Validation failed') });
      expect(h.bucket.put).not.toHaveBeenCalled();
      expect(h.logoUriStored).not.toHaveBeenCalled();
    });

    it('write スコープでも通る', async () => {
      const { h, token } = await setupUser('write');

      expect((await patch(h, token, {})).status).toBe(200);
    });

    it('write:accounts がなければ 403、認証がなければ 401 にする', async () => {
      const { h, token } = await setupUser('read:accounts profile');

      const forbidden = await patch(h, token, { avatar: new File([png()], 'a.png', { type: 'image/png' }) });
      const anonymous = await h.request('/api/v1/accounts/update_credentials', { method: 'PATCH' });

      expect([forbidden.status, anonymous.status]).toEqual([403, 401]);
      expect(h.bucket.put).not.toHaveBeenCalled();
    });
  });

  describe('instance', () => {
    it('v1 と v2 を認証なしで返し、スキーマで parse できる', async () => {
      const h = setup();
      h.addUser(crypto.randomUUID(), 'kosui');

      const [v1, v2] = await Promise.all([h.request('/api/v1/instance'), h.request('/api/v2/instance')]);

      expect(v1.status).toBe(200);
      expect(v2.status).toBe(200);
      const v1Body = InstanceV1Schema.parse(await v1.json());
      const v2Body = InstanceV2Schema.parse(await v2.json());
      expect(v1Body).toMatchObject({
        uri: 'iori.test',
        title: 'iori.test',
        description: 'A microblog by kosui',
        contact_account: { username: 'kosui' },
        configuration: { vapid: { public_key: 'vapid-key' } },
      });
      expect(v2Body).toMatchObject({
        domain: 'iori.test',
        contact: { account: { username: 'kosui' } },
        configuration: { vapid: { public_key: 'vapid-key' } },
      });
    });

    it('v1 に pleroma.metadata.post_formats を足し、version は Mastodon 互換のままにする', async () => {
      const response = await setup().request('/api/v1/instance');

      const body = InstanceV1Schema.parse(await response.json());
      expect(body.pleroma).toEqual({ metadata: { post_formats: ['text/plain', 'text/markdown'] } });
      expect(body.version).toMatch(/^4\.3\.0 \(compatible; iori \S+\)$/);
    });

    it('連絡先の利用者がいなければ contact_account を null にする', async () => {
      const h = setup();

      const response = await h.request('/api/v1/instance');

      expect(InstanceV1Schema.parse(await response.json()).contact_account).toBeNull();
    });
  });

  describe('空の応答', () => {
    const emptyArrays: ReadonlyArray<readonly [string, string | undefined]> = [
      ['/api/v1/custom_emojis', undefined],
      ['/api/v1/accounts/abc/featured_tags', undefined],
      ['/api/v1/accounts/abc/endorsements', undefined],
      ['/api/v1/trends/statuses', undefined],
      ['/api/v1/trends/tags', undefined],
      ['/api/v1/trends/links', undefined],
      ['/api/v1/filters', 'read:filters'],
      ['/api/v2/filters', 'read:filters'],
      ['/api/v1/lists', 'read:lists'],
      ['/api/v1/announcements', 'read'],
      ['/api/v1/followed_tags', 'read:follows'],
      ['/api/v1/follow_requests', 'read:follows'],
      ['/api/v1/domain_blocks', 'read:blocks'],
      ['/api/v1/featured_tags', 'read:accounts'],
      ['/api/v1/conversations', 'read:statuses'],
      ['/api/v1/scheduled_statuses', 'read:statuses'],
    ];

    it.each(emptyArrays)('%s は [] を返す', async (path, scope) => {
      const h = setup();
      const headers: Record<string, string> = {};
      if (scope !== undefined) {
        headers['Authorization'] = `Bearer ${(await h.issueUserToken(scope)).token}`;
      }

      const response = await h.request(path, { headers });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it.each(emptyArrays.filter(([, scope]) => scope !== undefined))(
      '%s は認証がなければ 401、スコープが違えば 403 にする',
      async (path, scope) => {
        const h = setup();
        const otherScope = scope === 'read:statuses' ? 'read:lists' : 'read:statuses';
        const { token } = await h.issueUserToken(scope === 'read' ? 'follow' : otherScope);

        const anonymous = await h.request(path);
        const denied = await h.request(path, { headers: { Authorization: `Bearer ${token}` } });

        expect(anonymous.status).toBe(401);
        expect(denied.status).toBe(403);
      },
    );

    it('instance/languages は日本語と英語を認証なしで返す', async () => {
      const response = await setup().request('/api/v1/instance/languages');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{ code: 'ja', name: 'Japanese' }, { code: 'en', name: 'English' }]);
    });

    it('instance/translation_languages は空のオブジェクトを認証なしで返す', async () => {
      const response = await setup().request('/api/v1/instance/translation_languages');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({});
    });

    it('instance/translation_languages は AI が設定されていれば und から ja への翻訳を返す', async () => {
      const response = await setup({ translationEnabled: true }).request('/api/v1/instance/translation_languages');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ und: ['ja'] });
    });

    it('v2/instance の translation.enabled は AI の設定に従う', async () => {
      const enabled = setup({ translationEnabled: true });
      enabled.addUser(crypto.randomUUID(), 'kosui');
      const disabled = setup();
      disabled.addUser(crypto.randomUUID(), 'kosui');

      const enabledBody = InstanceV2Schema.parse(await (await enabled.request('/api/v2/instance')).json());
      const disabledBody = InstanceV2Schema.parse(await (await disabled.request('/api/v2/instance')).json());

      expect(enabledBody.configuration.translation).toEqual({ enabled: true });
      expect(disabledBody.configuration.translation).toEqual({ enabled: false });
    });

    it('instance/extended_description は空の説明を認証なしで返す', async () => {
      const response = await setup().request('/api/v1/instance/extended_description');

      expect(response.status).toBe(200);
      expect(ExtendedDescriptionSchema.parse(await response.json())).toEqual({ updated_at: null, content: '' });
    });

    it('familiar_followers は id[] と id ごとに空の accounts を返す', async () => {
      const h = setup();
      const { token } = await h.issueUserToken('read:follows');

      const response = await h.request('/api/v1/accounts/familiar_followers?id[]=a&id[]=b&id=c', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { id: 'a', accounts: [] },
        { id: 'b', accounts: [] },
        { id: 'c', accounts: [] },
      ]);
    });

    it('familiar_followers は認証がなければ 401、スコープが違えば 403 にする', async () => {
      const h = setup();
      const { token } = await h.issueUserToken('read:statuses');

      const anonymous = await h.request('/api/v1/accounts/familiar_followers?id[]=a');
      const denied = await h.request('/api/v1/accounts/familiar_followers?id[]=a', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(anonymous.status).toBe(401);
      expect(denied.status).toBe(403);
    });

    it('preferences を返す', async () => {
      const h = setup();
      const { token } = await h.issueUserToken('read:accounts');

      const response = await h.request('/api/v1/preferences', { headers: { Authorization: `Bearer ${token}` } });

      expect(await response.json()).toEqual({
        'posting:default:visibility': 'public',
        'posting:default:sensitive': false,
        'posting:default:language': null,
        'reading:expand:media': 'default',
        'reading:expand:spoilers': false,
      });
    });

    it('push の購読がなければ 404 を返す', async () => {
      const h = setup();
      const { token } = await h.issueUserToken('push');

      const response = await h.request('/api/v1/push/subscription', { headers: { Authorization: `Bearer ${token}` } });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Record not found' });
    });
  });

  describe('未実装のパスの受け皿', () => {
    it('/api/v1 と /api/v2 の未実装のパスに 404 を返し、認証付きの要求だけメソッドとパスをログに出す', async () => {
      const h = setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { token, sessionId } = { ...(await h.issueUserToken('read')), ...h.memory.addSession() };

      const responses = await Promise.all([
        h.request('/api/v1/statuses/abc?secret=1', { headers: { Authorization: `Bearer ${token}` } }),
        h.request('/api/v2/unknown', { method: 'POST', headers: { Cookie: `sessionId=${sessionId}` } }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404]);
      expect(await responses[0]!.json()).toEqual({ error: 'Record not found' });
      const logged = warn.mock.calls.map((call) => String(call[0]));
      expect(logged).toContain('Unimplemented Mastodon API: GET /api/v1/statuses/abc');
      expect(logged).toContain('Unimplemented Mastodon API: POST /api/v2/unknown');
      expect(logged.join('\n')).not.toContain('secret');
      warn.mockRestore();
    });

    it('Authorization も Cookie の sessionId もない要求は 404 を返し、ログに出さない', async () => {
      const h = setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const responses = await Promise.all([
        h.request('/api/v1/statuses/abc'),
        h.request('/api/v2/unknown', { method: 'POST' }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404]);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('/api/v1 と /api/v2 の外には影響しない', async () => {
      const h = setup();

      const [og, other] = await Promise.all([h.request('/api/og/articles/x'), h.request('/api/other')]);

      expect(og.status).toBe(200);
      expect(other.status).toBe(404);
      expect(await other.text()).toBe('404 Not Found');
    });
  });
});
