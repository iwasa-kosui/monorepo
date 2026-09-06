import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1ActorResolverByUserId } from '../actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowerId } from '../actor/actorsResolverByFollowerId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1LinkPreviewCreatedStore } from '../linkPreview/linkPreviewCreatedStore.ts';
import { createD1MutedActorIdsResolverByUserId } from '../mute/mutedActorIdsResolverByUserId.ts';
import { createD1AcceptedRelaysResolver } from '../relay/acceptedRelaysResolver.ts';

describe('D1 Worker timeline and posting dependencies', () => {
  it('resolves the local actor and followed actors from D1 rows', async () => {
    const userId = UserId.generate();
    const localActorId = ActorId.generate();
    const followedActorId = ActorId.generate();
    const where = vi.fn()
      .mockResolvedValueOnce([{
        actors: {
          actorId: localActorId,
          uri: 'https://worker.test/users/kosui',
          inboxUrl: 'https://worker.test/inbox',
          logoUri: null,
        },
        local_actors: { userId },
      }])
      .mockResolvedValueOnce([{
        actors: {
          actorId: followedActorId,
          uri: 'https://remote.test/users/other',
          inboxUrl: 'https://remote.test/inbox',
          logoUri: null,
        },
        local_actors: null,
        remote_actors: { url: 'https://remote.test/@other', username: 'other' },
      }]);
    const builder = {
      from: () => builder,
      leftJoin: () => builder,
      where,
    };
    const db = { select: () => builder } as unknown as IoriD1Db;

    const local = await createD1ActorResolverByUserId(db).resolve(userId);
    const following = await createD1ActorsResolverByFollowerId(db).resolve(localActorId);

    expect(local).toMatchObject({ ok: true, val: { id: localActorId, userId, type: 'local' } });
    expect(following).toMatchObject({ ok: true, val: [{ id: followedActorId, type: 'remote', username: 'other' }] });
  });

  it('reads muted actor IDs, persists link previews, and maps accepted relays', async () => {
    const mutedActorId = ActorId.generate();
    const insert = vi.fn(() => ({ values: vi.fn() }));
    const where = vi.fn()
      .mockResolvedValueOnce([{ mutedActorId }])
      .mockResolvedValueOnce([{
        relayId: 'e2fdc9a4-a886-47de-856f-a8470bb10c69',
        inboxUrl: 'https://relay.test/inbox',
        actorUri: 'https://relay.test/actor',
        status: 'accepted',
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        acceptedAt: new Date('2026-08-05T01:00:00.000Z'),
      }]);
    const db = {
      insert,
      select: () => ({ from: () => ({ where }) }),
    } as unknown as IoriD1Db;
    const preview = {
      linkPreviewId: LinkPreviewId.generate(),
      postId: PostId.generate(),
      url: 'https://example.test/article',
      title: 'Article',
      description: null,
      imageUrl: null,
      faviconUrl: null,
      siteName: 'Example',
      createdAt: Date.now() as never,
    };

    const muted = await createD1MutedActorIdsResolverByUserId(db).resolve(UserId.generate());
    await createD1LinkPreviewCreatedStore(db).store([preview]);
    const relays = await createD1AcceptedRelaysResolver(db).resolve();

    expect(muted).toEqual({ ok: true, val: [mutedActorId], err: undefined });
    expect(insert).toHaveBeenCalledOnce();
    expect(relays).toMatchObject({
      ok: true,
      val: [{ actorUri: 'https://relay.test/actor', status: 'accepted' }],
    });
  });
});
