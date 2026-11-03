import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { RemotePost } from '../../../domain/post/post.ts';
import { PgRemotePostUpserter } from './remotePostUpserter.ts';

const identity = {
  uri: 'https://remote.example/posts/1',
  content: '<p>hello</p>',
  authorIdentity: {
    uri: 'https://remote.example/users/alice',
    inboxUrl: 'https://remote.example/users/alice/inbox',
  },
  inReplyToUri: null,
  attachments: [{ url: 'https://remote.example/media/1.png', altText: null }],
};

const createDeps = (existing: RemotePost | undefined) => {
  const postImageCreatedStore = { store: vi.fn(async () => {}) };
  const deps = {
    postResolverByUri: { resolve: vi.fn(async () => RA.ok(existing)) },
    postCreatedStore: { store: vi.fn(async () => RA.ok(undefined)) },
    postImageCreatedStore,
    remoteActorCreatedStore: { store: vi.fn(async () => RA.ok(undefined)) },
    logoUriUpdatedStore: { store: vi.fn(async () => RA.ok(undefined)) },
    actorResolverByUri: {
      resolve: vi.fn(async () => RA.ok({ id: ActorId.generate(), logoUri: undefined })),
    },
  };
  return { deps: deps as never, postImageCreatedStore };
};

describe('PgRemotePostUpserter', () => {
  it('stores attachments as post images when it creates a new post', async () => {
    const { deps, postImageCreatedStore } = createDeps(undefined);

    const result = await PgRemotePostUpserter.create(deps).resolve(identity);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(postImageCreatedStore.store).toHaveBeenCalledOnce();
    expect(postImageCreatedStore.store).toHaveBeenCalledWith([
      expect.objectContaining({
        postId: result.val.postId,
        url: 'https://remote.example/media/1.png',
        altText: null,
      }),
    ]);
  });

  it('does not store attachments when the post already exists', async () => {
    const { deps, postImageCreatedStore } = createDeps({ postId: 'existing' } as unknown as RemotePost);

    const result = await PgRemotePostUpserter.create(deps).resolve(identity);

    expect(result.ok).toBe(true);
    expect(postImageCreatedStore.store).not.toHaveBeenCalled();
  });

  it('returns the created post even when the image store rejects', async () => {
    const { deps, postImageCreatedStore } = createDeps(undefined);
    postImageCreatedStore.store.mockRejectedValueOnce(new Error('image store failed'));

    const result = await PgRemotePostUpserter.create(deps).resolve(identity);

    expect(result.ok).toBe(true);
    expect(postImageCreatedStore.store).toHaveBeenCalledOnce();
  });
});
