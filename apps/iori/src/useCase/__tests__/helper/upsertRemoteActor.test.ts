import { describe, expect, it } from 'vitest';

import type { RemoteActor } from '../../../domain/actor/remoteActor.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { upsertRemoteActor } from '../../helper/upsertRemoteActor.ts';
import {
  createMockActorResolverByUri,
  createMockLogoUriUpdatedStore,
  createMockRemoteActorCreatedStore,
} from './mockAdaptors.ts';

describe('upsertRemoteActor', () => {
  const createDeps = () => {
    const remoteActorCreatedStore = createMockRemoteActorCreatedStore();
    const logoUriUpdatedStore = createMockLogoUriUpdatedStore();
    const actorResolverByUri = createMockActorResolverByUri();
    const now = Instant.now();
    return {
      now,
      remoteActorCreatedStore,
      logoUriUpdatedStore,
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

    it('新規作成時に remoteActorCreatedStore.store が呼ばれる', async () => {
      const deps = createDeps();
      const identity = {
        uri: 'https://remote.example.com/users/bob',
        inboxUrl: 'https://remote.example.com/users/bob/inbox',
      };

      const upsert = upsertRemoteActor(deps);
      await upsert(identity);

      expect(deps.remoteActorCreatedStore.store).toHaveBeenCalledTimes(1);
    });

    it('新規作成時に logoUriUpdatedStore.store は呼ばれない', async () => {
      const deps = createDeps();
      const identity = {
        uri: 'https://remote.example.com/users/charlie',
        inboxUrl: 'https://remote.example.com/users/charlie/inbox',
      };

      const upsert = upsertRemoteActor(deps);
      await upsert(identity);

      expect(deps.logoUriUpdatedStore.store).not.toHaveBeenCalled();
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

    it('logoUri更新時に logoUriUpdatedStore.store が呼ばれる', async () => {
      const deps = createDeps();
      const existingActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/eve',
        inboxUrl: 'https://remote.example.com/users/eve/inbox',
        type: 'remote',
        logoUri: 'https://remote.example.com/avatars/eve-old.png',
      };
      deps.actorResolverByUri.setActor(existingActor);

      const identity = {
        uri: existingActor.uri,
        inboxUrl: existingActor.inboxUrl,
        logoUri: 'https://remote.example.com/avatars/eve-new.png',
      };

      const upsert = upsertRemoteActor(deps);
      await upsert(identity);

      expect(deps.logoUriUpdatedStore.store).toHaveBeenCalledTimes(1);
    });

    it('logoUri更新時に remoteActorCreatedStore.store は呼ばれない', async () => {
      const deps = createDeps();
      const existingActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/frank',
        inboxUrl: 'https://remote.example.com/users/frank/inbox',
        type: 'remote',
        logoUri: 'https://remote.example.com/avatars/frank-old.png',
      };
      deps.actorResolverByUri.setActor(existingActor);

      const identity = {
        uri: existingActor.uri,
        inboxUrl: existingActor.inboxUrl,
        logoUri: 'https://remote.example.com/avatars/frank-new.png',
      };

      const upsert = upsertRemoteActor(deps);
      await upsert(identity);

      expect(deps.remoteActorCreatedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('変更なし', () => {
    it('既存のアクターのlogoUriが同じ場合、既存のアクターをそのまま返す', async () => {
      const deps = createDeps();
      const existingActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/grace',
        inboxUrl: 'https://remote.example.com/users/grace/inbox',
        type: 'remote',
        logoUri: 'https://remote.example.com/avatars/grace.png',
      };
      deps.actorResolverByUri.setActor(existingActor);

      const identity = {
        uri: existingActor.uri,
        inboxUrl: existingActor.inboxUrl,
        logoUri: existingActor.logoUri,
      };

      const upsert = upsertRemoteActor(deps);
      const result = await upsert(identity);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val).toEqual(existingActor);
      }
    });

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
});
