import { describe, expect, it } from 'vitest';

import type { RemoteActor } from '../../../domain/actor/remoteActor.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { upsertRemoteActor } from '../../helper/upsertRemoteActor.ts';
import {
  createMockActorResolverByUri,
  createMockLogoUriUpdatedStore,
  createMockRemoteActorCreatedStore,
  createMockRemoteActorProfileUpdatedStore,
} from './mockAdaptors.ts';

describe('upsertRemoteActor', () => {
  const createDeps = () => {
    const remoteActorCreatedStore = createMockRemoteActorCreatedStore();
    const logoUriUpdatedStore = createMockLogoUriUpdatedStore();
    const remoteActorProfileUpdatedStore = createMockRemoteActorProfileUpdatedStore();
    const actorResolverByUri = createMockActorResolverByUri();
    const now = Instant.now();
    return {
      now,
      remoteActorCreatedStore,
      logoUriUpdatedStore,
      remoteActorProfileUpdatedStore,
      actorResolverByUri,
    };
  };

  describe('新規作成', () => {
    it('既存のアクターがいない場合、新しいRemoteActorを作成する', async () => {
      const deps = createDeps();
      const identity = {
        uri: 'https://remote.example.com/users/alice',
        inboxUrl: 'https://remote.example.com/users/alice/inbox',
        url: 'https://remote.example.com/@alice',
        username: 'alice',
        logoUri: 'https://remote.example.com/avatars/alice.png',
      };

      const upsert = upsertRemoteActor(deps);
      const result = await upsert(identity);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.uri).toBe(identity.uri);
        expect(result.val.inboxUrl).toBe(identity.inboxUrl);
        expect(result.val.type).toBe('remote');
        expect((result.val as RemoteActor).username).toBe(identity.username);
        expect(result.val.logoUri).toBe(identity.logoUri);
      }
    });
  });

  describe('logoUri更新', () => {
    it('既存のアクターのlogoUriが変更された場合、更新されたActorを返す', async () => {
      const deps = createDeps();
      const existingActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/david',
        inboxUrl: 'https://remote.example.com/users/david/inbox',
        type: 'remote',
        username: 'david',
        url: 'https://remote.example.com/@david',
        logoUri: 'https://remote.example.com/avatars/david-old.png',
      };
      deps.actorResolverByUri.setActor(existingActor);

      const identity = {
        uri: existingActor.uri,
        inboxUrl: existingActor.inboxUrl,
        username: 'david',
        url: 'https://remote.example.com/@david',
        logoUri: 'https://remote.example.com/avatars/david-new.png',
      };

      const upsert = upsertRemoteActor(deps);
      const result = await upsert(identity);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.logoUri).toBe(identity.logoUri);
        expect(result.val.id).toBe(existingActor.id);
      }
    });
  });

  describe('変更なし', () => {
    it('既存のアクターがいてidentityにlogoUriがない場合、既存のアクターをそのまま返す', async () => {
      const deps = createDeps();
      const existingActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/henry',
        inboxUrl: 'https://remote.example.com/users/henry/inbox',
        type: 'remote',
        logoUri: 'https://remote.example.com/avatars/henry.png',
      };
      deps.actorResolverByUri.setActor(existingActor);

      const identity = {
        uri: existingActor.uri,
        inboxUrl: existingActor.inboxUrl,
      };

      const upsert = upsertRemoteActor(deps);
      const result = await upsert(identity);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val).toEqual(existingActor);
      }
    });

    it('変更なしの場合、どのstoreも呼ばれない', async () => {
      const deps = createDeps();
      const existingActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/iris',
        inboxUrl: 'https://remote.example.com/users/iris/inbox',
        type: 'remote',
        logoUri: 'https://remote.example.com/avatars/iris.png',
      };
      deps.actorResolverByUri.setActor(existingActor);

      const identity = {
        uri: existingActor.uri,
        inboxUrl: existingActor.inboxUrl,
        logoUri: existingActor.logoUri,
      };

      const upsert = upsertRemoteActor(deps);
      await upsert(identity);

      expect(deps.remoteActorCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.logoUriUpdatedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('プロフィール', () => {
    const base = {
      uri: 'https://remote.example.com/users/pat',
      inboxUrl: 'https://remote.example.com/users/pat/inbox',
    };
    const existing = (overrides: Partial<RemoteActor> = {}): RemoteActor => ({
      id: crypto.randomUUID() as RemoteActor['id'],
      ...base,
      type: 'remote',
      displayName: 'Pat',
      summary: '<p>hello</p>',
      ...overrides,
    });

    it('新規作成時に profile が RemoteActor に入る', async () => {
      const deps = createDeps();
      const profile = {
        displayName: 'Pat',
        summary: '<p>hi</p>',
        actorType: 'Service' as const,
        fields: [{ name: 'web', value: 'example' }],
        emojis: [],
      };

      const result = await upsertRemoteActor(deps)({ ...base, profile });

      expect(result.ok && (result.val as RemoteActor)).toMatchObject({
        displayName: 'Pat',
        summary: '<p>hi</p>',
        actorType: 'Service',
        fields: [{ name: 'web', value: 'example' }],
      });
      expect(deps.remoteActorProfileUpdatedStore.store).not.toHaveBeenCalled();
    });

    it('profile が保存済みの値と違えば remoteActorProfileUpdatedStore.store で更新する', async () => {
      const deps = createDeps();
      const actor = existing();
      deps.actorResolverByUri.setActor(actor);

      const result = await upsertRemoteActor(deps)({ ...base, profile: { displayName: 'Patricia' } });

      expect(deps.remoteActorProfileUpdatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.remoteActorCreatedStore.store).not.toHaveBeenCalled();
      expect(result.ok && (result.val as RemoteActor).displayName).toBe('Patricia');
      expect(result.ok && (result.val as RemoteActor).summary).toBe('<p>hello</p>');
    });

    it('profile の値が null のときは保存済みの値を空にする', async () => {
      const deps = createDeps();
      deps.actorResolverByUri.setActor(existing());

      const result = await upsertRemoteActor(deps)({ ...base, profile: { summary: null } });

      expect(deps.remoteActorProfileUpdatedStore.store).toHaveBeenCalledTimes(1);
      expect(result.ok && (result.val as RemoteActor).summary).toBeUndefined();
    });

    it('profile が保存済みの値と同じなら更新しない', async () => {
      const deps = createDeps();
      deps.actorResolverByUri.setActor(existing({ fields: [{ name: 'web', value: 'example' }] }));

      await upsertRemoteActor(deps)({
        ...base,
        profile: {
          displayName: 'Pat',
          summary: '<p>hello</p>',
          fields: [{ name: 'web', value: 'example' }],
          emojis: [],
        },
      });

      expect(deps.remoteActorProfileUpdatedStore.store).not.toHaveBeenCalled();
    });
  });
});
