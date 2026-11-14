import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Post, type RemotePost } from '../../domain/post/post.ts';
import type { RemotePostPoll } from '../../domain/post/remotePostPoll.ts';
import { UpdateRemotePostPollUseCase } from '../updateRemotePostPoll.ts';

const authorId = ActorId.generate();
const post: RemotePost = Post.createRemotePost(Instant.orThrow(1_000))({
  actorId: authorId,
  content: '<p>q</p>',
  uri: 'https://remote.example/notes/1',
  visibility: null,
}).aggregateState;
const poll: RemotePostPoll = {
  multiple: false,
  options: [{ title: '赤', votesCount: 3 }],
  votersCount: 3,
  expiresAt: null,
  closed: false,
};

const setup = (overrides: { post?: RemotePost | undefined; actorId?: ActorId | undefined } = {}) => {
  const store = vi.fn(async () => RA.ok(undefined));
  const useCase = UpdateRemotePostPollUseCase.create({
    postResolverByUri: { resolve: async () => RA.ok('post' in overrides ? overrides.post : post) },
    actorResolverByUri: {
      resolve: async () => RA.ok(('actorId' in overrides ? { id: overrides.actorId } : { id: authorId }) as Actor),
    },
    remotePostPollUpdatedStore: { store },
  });
  return { store, useCase };
};

describe('UpdateRemotePostPollUseCase', () => {
  it('投稿の作者からの更新なら、投票だけを更新するイベントを保存する', async () => {
    const { store, useCase } = setup();

    const result = await useCase.run({ uri: post.uri, actorUri: 'https://remote.example/users/alice', poll });

    expect(result).toMatchObject({ ok: true, val: { type: 'updated', post } });
    expect(store).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'post.remotePostPollUpdated', eventPayload: { postId: post.postId, poll } }),
    );
  });

  it('投稿の作者でない actor からの更新は保存しない', async () => {
    const { store, useCase } = setup({ actorId: ActorId.generate() });

    const result = await useCase.run({ uri: post.uri, actorUri: 'https://remote.example/users/mallory', poll });

    expect(result).toMatchObject({
      ok: false,
      err: {
        type: 'RemotePostUpdateAuthorMismatchError',
        detail: { uri: post.uri, actorUri: 'https://remote.example/users/mallory' },
      },
    });
    expect(store).not.toHaveBeenCalled();
  });
});
