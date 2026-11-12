import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { RemotePost } from '../../../domain/post/post.ts';
import { createD1RemotePostUpserter } from './remotePostUpserter.ts';

const identity = {
  uri: 'https://remote.example/posts/1',
  content: '<p>hello</p>',
  authorIdentity: {
    uri: 'https://remote.example/users/alice',
    inboxUrl: 'https://remote.example/users/alice/inbox',
  },
  inReplyToUri: null,
  visibility: null,
  attachments: [{ url: 'https://remote.example/media/1.png', altText: null, mediaType: null }],
};

const createDeps = (existing: RemotePost | undefined) => {
  const postImageCreatedStore = { store: vi.fn(async () => {}) };
  const postCreatedStore = { store: vi.fn(async () => RA.ok(undefined)) };
  const deps = {
    postResolverByUri: { resolve: vi.fn(async () => RA.ok(existing)) },
    postCreatedStore,
    postImageCreatedStore,
    remoteActorCreatedStore: { store: vi.fn(async () => RA.ok(undefined)) },
    logoUriUpdatedStore: { store: vi.fn(async () => RA.ok(undefined)) },
    actorResolverByUri: {
      resolve: vi.fn(async () => RA.ok({ id: ActorId.generate(), logoUri: undefined })),
    },
  };
  return { deps: deps as never, postImageCreatedStore, postCreatedStore };
};

describe('createD1RemotePostUpserter', () => {
  it('stores attachments as post images when it creates a new post', async () => {
    const { deps, postImageCreatedStore } = createDeps(undefined);

    const result = await createD1RemotePostUpserter(deps).resolve(identity);

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

  it('passes the mediaType of each attachment to the image store', async () => {
    const { deps, postImageCreatedStore } = createDeps(undefined);

    const result = await createD1RemotePostUpserter(deps).resolve({
      ...identity,
      attachments: [
        { url: 'https://remote.example/media/1.mp4', altText: null, mediaType: 'video/mp4' },
        { url: 'https://remote.example/media/2.png', altText: null, mediaType: null },
      ],
    });

    expect(result.ok).toBe(true);
    expect(postImageCreatedStore.store).toHaveBeenCalledWith([
      expect.objectContaining({ url: 'https://remote.example/media/1.mp4', mediaType: 'video/mp4' }),
      expect.objectContaining({ url: 'https://remote.example/media/2.png', mediaType: null }),
    ]);
  });

  it('records the visibility of a new post', async () => {
    const { deps, postCreatedStore } = createDeps(undefined);

    const result = await createD1RemotePostUpserter(deps).resolve({ ...identity, visibility: 'unlisted' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val.visibility).toBe('unlisted');
    expect(postCreatedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({ aggregateState: expect.objectContaining({ visibility: 'unlisted' }) }),
    );
  });

  it('records the summary and sensitive flag of a new post', async () => {
    const { deps, postCreatedStore } = createDeps(undefined);

    const result = await createD1RemotePostUpserter(deps).resolve({
      ...identity,
      summary: 'ネタバレ注意',
      sensitive: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val).toMatchObject({ summary: 'ネタバレ注意', sensitive: true });
    expect(postCreatedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateState: expect.objectContaining({ summary: 'ネタバレ注意', sensitive: true }),
      }),
    );
  });

  it('passes the quoted note URI of a new post to the store', async () => {
    const { deps, postCreatedStore } = createDeps(undefined);

    await createD1RemotePostUpserter(deps).resolve({
      ...identity,
      quoteUri: 'https://remote.example/posts/quoted',
    });

    expect(postCreatedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({
        eventPayload: expect.objectContaining({ quoteUri: 'https://remote.example/posts/quoted' }),
      }),
    );
  });

  it('passes the poll of a new post to the store', async () => {
    const { deps, postCreatedStore } = createDeps(undefined);
    const poll = {
      multiple: false,
      options: [{ title: 'a', votesCount: 2 }],
      votersCount: 2,
      expiresAt: null,
      closed: false,
    };

    await createD1RemotePostUpserter(deps).resolve({ ...identity, poll });

    expect(postCreatedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({ eventPayload: expect.objectContaining({ poll }) }),
    );
  });

  it('passes a null poll to the store when the identity has no poll', async () => {
    const { deps, postCreatedStore } = createDeps(undefined);

    await createD1RemotePostUpserter(deps).resolve(identity);

    expect(postCreatedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({ eventPayload: expect.objectContaining({ poll: null }) }),
    );
  });

  it('passes the recipients of a new post to the store', async () => {
    const { deps, postCreatedStore } = createDeps(undefined);

    await createD1RemotePostUpserter(deps).resolve({
      ...identity,
      visibility: 'direct',
      recipientActorUris: ['https://iori.test/users/kosui'],
    });

    expect(postCreatedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({
        eventPayload: expect.objectContaining({ recipientActorUris: ['https://iori.test/users/kosui'] }),
      }),
    );
  });

  it('passes the author and the mentioned actors of a new direct post as participants', async () => {
    const { deps, postCreatedStore } = createDeps(undefined);

    await createD1RemotePostUpserter(deps).resolve({
      ...identity,
      visibility: 'direct',
      mentionedActorUris: ['https://other.example/users/bob'],
    });

    expect(postCreatedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({
        eventPayload: expect.objectContaining({
          participantActorUris: ['https://remote.example/users/alice', 'https://other.example/users/bob'],
        }),
      }),
    );
  });

  describe('createdAt', () => {
    const now = Date.parse('2026-11-12T00:00:00.000Z');

    const createdAtOf = async (publishedAt: number | undefined) => {
      const { deps, postCreatedStore } = createDeps(undefined);
      const result = await createD1RemotePostUpserter(deps).resolve({
        ...identity,
        publishedAt: publishedAt === undefined ? undefined : Instant.orThrow(publishedAt),
      });
      expect(result.ok).toBe(true);
      return {
        post: result.ok ? result.val.createdAt : undefined,
        stored:
          ((postCreatedStore.store.mock.calls as unknown[][])[0]?.[0] as { aggregateState: { createdAt: number } })
            .aggregateState.createdAt,
      };
    };

    it('uses publishedAt as createdAt when it is given', async () => {
      vi.useFakeTimers({ now });
      try {
        const published = Date.parse('2024-01-02T03:04:05.000Z');

        expect(await createdAtOf(published)).toEqual({ post: published, stored: published });
      } finally {
        vi.useRealTimers();
      }
    });

    it('uses the current time when publishedAt is not given', async () => {
      vi.useFakeTimers({ now });
      try {
        expect(await createdAtOf(undefined)).toEqual({ post: now, stored: now });
      } finally {
        vi.useRealTimers();
      }
    });

    it('uses the current time when publishedAt is in the future', async () => {
      vi.useFakeTimers({ now });
      try {
        expect(await createdAtOf(now + 60_000)).toEqual({ post: now, stored: now });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('does not store again when the post already exists', async () => {
    const { deps, postCreatedStore } = createDeps({ postId: 'existing' } as unknown as RemotePost);

    await createD1RemotePostUpserter(deps).resolve({
      ...identity,
      recipientActorUris: ['https://iori.test/users/kosui'],
    });

    expect(postCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store attachments when the post already exists', async () => {
    const { deps, postImageCreatedStore } = createDeps({ postId: 'existing' } as unknown as RemotePost);

    const result = await createD1RemotePostUpserter(deps).resolve(identity);

    expect(result.ok).toBe(true);
    expect(postImageCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store attachments when the post store rejects', async () => {
    const { deps, postImageCreatedStore, postCreatedStore } = createDeps(undefined);
    postCreatedStore.store.mockRejectedValueOnce(new Error('post store failed'));

    await expect(createD1RemotePostUpserter(deps).resolve(identity)).rejects.toThrow('post store failed');

    expect(postImageCreatedStore.store).not.toHaveBeenCalled();
  });

  it('returns the created post even when the image store rejects', async () => {
    const { deps, postImageCreatedStore } = createDeps(undefined);
    postImageCreatedStore.store.mockRejectedValueOnce(new Error('image store failed'));

    const result = await createD1RemotePostUpserter(deps).resolve(identity);

    expect(result.ok).toBe(true);
    expect(postImageCreatedStore.store).toHaveBeenCalledOnce();
  });
});
