import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import type { RemoteActor } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import type { EmojiReact } from '../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../domain/emojiReact/emojiReactId.ts';
import { PostId } from '../../domain/post/postId.ts';
import { RemoveReceivedEmojiReactUseCase } from '../removeReceivedEmojiReact.ts';
import { createMockActorResolverById, createMockEmojiReactDeletedStore } from './helper/mockAdaptors.ts';

describe('RemoveReceivedEmojiReactUseCase', () => {
  const emojiReactActivityUri = 'https://misskey.example/likes/1';
  const alice: RemoteActor = {
    id: ActorId.generate(),
    uri: 'https://misskey.example/users/alice',
    inboxUrl: 'https://misskey.example/users/alice/inbox',
    type: 'remote',
  };
  const emojiReact: EmojiReact = {
    emojiReactId: EmojiReactId.generate(),
    actorId: alice.id,
    postId: PostId.generate(),
    emoji: ':wave:',
    emojiReactActivityUri,
    emojiImageUrl: null,
  };

  const createDeps = () => {
    const actorResolverById = createMockActorResolverById();
    actorResolverById.setActor(alice);
    const emojiReactDeletedStore = createMockEmojiReactDeletedStore();
    const useCase = RemoveReceivedEmojiReactUseCase.create({
      actorResolverById,
      emojiReactDeletedStore,
      emojiReactResolverByActivityUri: {
        resolve: ({ emojiReactActivityUri: uri }) =>
          RA.ok(uri === emojiReact.emojiReactActivityUri ? emojiReact : undefined),
      },
    });
    return { useCase, emojiReactDeletedStore };
  };

  it('保存した actor 本人の Undo では削除する', async () => {
    const { useCase, emojiReactDeletedStore } = createDeps();
    const result = await useCase.run({ emojiReactActivityUri, actorUri: alice.uri });
    expect(result.ok).toBe(true);
    expect(emojiReactDeletedStore.items).toHaveLength(1);
  });

  it('同じホストの別の actor の Undo では削除せず UndoActorMismatchError を返す', async () => {
    const { useCase, emojiReactDeletedStore } = createDeps();
    const result = await useCase.run({ emojiReactActivityUri, actorUri: 'https://misskey.example/users/mallory' });
    expect(!result.ok && result.err.type).toBe('UndoActorMismatchError');
    expect(emojiReactDeletedStore.items).toHaveLength(0);
  });

  it('リアクションが無ければ EmojiReactNotFoundError を返す', async () => {
    const { useCase, emojiReactDeletedStore } = createDeps();
    const result = await useCase.run({
      emojiReactActivityUri: 'https://misskey.example/likes/404',
      actorUri: alice.uri,
    });
    expect(!result.ok && result.err.type).toBe('EmojiReactNotFoundError');
    expect(emojiReactDeletedStore.items).toHaveLength(0);
  });
});
