import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import type { RemoteActor } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import type { RemoteLike } from '../../domain/like/like.ts';
import { LikeId } from '../../domain/like/likeId.ts';
import { PostId } from '../../domain/post/postId.ts';
import { RemoveReceivedLikeUseCase } from '../removeReceivedLike.ts';
import { createMockActorResolverById, createMockRemoteLikeDeletedStore } from './helper/mockAdaptors.ts';

describe('RemoveReceivedLikeUseCase', () => {
  const likeActivityUri = 'https://misskey.example/likes/1';
  const alice: RemoteActor = {
    id: ActorId.generate(),
    uri: 'https://misskey.example/users/alice',
    inboxUrl: 'https://misskey.example/users/alice/inbox',
    type: 'remote',
  };
  const like: RemoteLike = {
    type: 'remote',
    likeId: LikeId.generate(),
    actorId: alice.id,
    postId: PostId.generate(),
    likeActivityUri,
  };

  const createDeps = () => {
    const actorResolverById = createMockActorResolverById();
    actorResolverById.setActor(alice);
    const remoteLikeDeletedStore = createMockRemoteLikeDeletedStore();
    const useCase = RemoveReceivedLikeUseCase.create({
      actorResolverById,
      remoteLikeDeletedStore,
      remoteLikeResolverByActivityUri: {
        resolve: ({ likeActivityUri: uri }) => RA.ok(uri === like.likeActivityUri ? like : undefined),
      },
    });
    return { useCase, remoteLikeDeletedStore };
  };

  it('保存した actor 本人の Undo では削除する', async () => {
    const { useCase, remoteLikeDeletedStore } = createDeps();
    const result = await useCase.run({ likeActivityUri, actorUri: alice.uri });
    expect(result.ok).toBe(true);
    expect(remoteLikeDeletedStore.items).toHaveLength(1);
  });

  it('同じホストの別の actor の Undo では削除せず UndoActorMismatchError を返す', async () => {
    const { useCase, remoteLikeDeletedStore } = createDeps();
    const result = await useCase.run({ likeActivityUri, actorUri: 'https://misskey.example/users/mallory' });
    expect(!result.ok && result.err.type).toBe('UndoActorMismatchError');
    expect(remoteLikeDeletedStore.items).toHaveLength(0);
  });

  it('いいねが無ければ LikeNotFoundError を返す', async () => {
    const { useCase, remoteLikeDeletedStore } = createDeps();
    const result = await useCase.run({ likeActivityUri: 'https://misskey.example/likes/404', actorUri: alice.uri });
    expect(!result.ok && result.err.type).toBe('LikeNotFoundError');
    expect(remoteLikeDeletedStore.items).toHaveLength(0);
  });
});
