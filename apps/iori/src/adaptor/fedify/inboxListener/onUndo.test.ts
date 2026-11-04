import { Like, type Undo } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { EmojiReact } from '../../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RemoveReceivedEmojiReactUseCase } from '../../../useCase/removeReceivedEmojiReact.ts';
import { RemoveReceivedLikeUseCase } from '../../../useCase/removeReceivedLike.ts';
import { createOnUndo, type OnUndoDeps } from './onUndo.ts';

const likeUri = 'https://misskey.example/likes/1';

const createDeps = (savedLikes: string[] = []) => {
  const emojiReacts: EmojiReact[] = [{
    emojiReactId: EmojiReactId.generate(),
    actorId: ActorId.generate(),
    postId: PostId.generate(),
    emoji: ':wave:',
    emojiReactActivityUri: likeUri,
    emojiImageUrl: null,
  }];
  const remoteLikes = savedLikes.map((likeActivityUri) => ({
    type: 'remote' as const,
    likeId: LikeId.generate(),
    actorId: ActorId.generate(),
    postId: PostId.generate(),
    likeActivityUri,
  }));
  const remoteLikeDeletedStore = {
    store: vi.fn(async (...events: { eventPayload: { likeActivityUri: string } }[]) => {
      for (const event of events) {
        const index = remoteLikes.findIndex((l) => l.likeActivityUri === event.eventPayload.likeActivityUri);
        if (index >= 0) remoteLikes.splice(index, 1);
      }
      return RA.ok(undefined);
    }),
  };
  const emojiReactDeletedStore = {
    store: vi.fn(async (...events: { eventPayload: { emojiReactId: string } }[]) => {
      for (const event of events) {
        const index = emojiReacts.findIndex((e) => e.emojiReactId === event.eventPayload.emojiReactId);
        if (index >= 0) emojiReacts.splice(index, 1);
      }
      return RA.ok(undefined);
    }),
  };
  const deps = {
    acceptUnfollowUseCase: { run: vi.fn() },
    removeReceivedRepostUseCase: { run: vi.fn() },
    removeReceivedLikeUseCase: RemoveReceivedLikeUseCase.create({
      remoteLikeDeletedStore: remoteLikeDeletedStore as never,
      remoteLikeResolverByActivityUri: {
        resolve: async ({ likeActivityUri }) => RA.ok(remoteLikes.find((l) => l.likeActivityUri === likeActivityUri)),
      },
    }),
    removeReceivedEmojiReactUseCase: RemoveReceivedEmojiReactUseCase.create({
      emojiReactDeletedStore: emojiReactDeletedStore as never,
      emojiReactResolverByActivityUri: {
        resolve: async ({ emojiReactActivityUri }) =>
          RA.ok(emojiReacts.find((e) => e.emojiReactActivityUri === emojiReactActivityUri)),
      },
    }),
  } as unknown as OnUndoDeps;
  return { deps, emojiReacts, remoteLikes };
};

const createUndo = (actorUri: string, likeId: string = likeUri) =>
  ({
    actorId: new URL(actorUri),
    getObject: vi.fn(async () =>
      new Like({
        id: new URL(likeId),
        actor: new URL('https://misskey.example/users/alice'),
        object: new URL('https://iori.test/notes/1'),
      })
    ),
  }) as unknown as Undo;

const ctx = { recipient: null, getDocumentLoader: vi.fn(async () => vi.fn()) } as never;

describe('createOnUndo (Undo Like)', () => {
  it('removes an emoji react saved from a Misskey-style Like when the actor has the same origin', async () => {
    const { deps, emojiReacts } = createDeps();
    await createOnUndo(deps)(ctx, createUndo('https://misskey.example/users/alice'));
    expect(emojiReacts).toHaveLength(0);
  });

  it('keeps the emoji react when the actor has a different origin', async () => {
    const { deps, emojiReacts } = createDeps();
    await createOnUndo(deps)(ctx, createUndo('https://evil.example/users/mallory'));
    expect(emojiReacts).toHaveLength(1);
  });

  it('removes a regular remote like without touching emoji reacts', async () => {
    const regularLikeUri = 'https://misskey.example/likes/2';
    const { deps, emojiReacts, remoteLikes } = createDeps([regularLikeUri]);
    await createOnUndo(deps)(ctx, createUndo('https://misskey.example/users/alice', regularLikeUri));
    expect(remoteLikes).toHaveLength(0);
    expect(emojiReacts).toHaveLength(1);
  });

  it('does nothing when neither a like nor an emoji react is found', async () => {
    const { deps, emojiReacts } = createDeps();
    await createOnUndo(deps)(
      ctx,
      createUndo('https://misskey.example/users/alice', 'https://misskey.example/likes/404'),
    );
    expect(emojiReacts).toHaveLength(1);
  });
});
