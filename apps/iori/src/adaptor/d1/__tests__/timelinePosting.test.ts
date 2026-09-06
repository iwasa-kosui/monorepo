import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { ImageId } from '../../../domain/image/imageId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import { TimelineItem } from '../../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1PostImageCreatedStore } from '../image/postImageCreatedStore.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1TimelineItemCreatedStore } from '../timeline/timelineItemCreatedStore.ts';
import { createD1TimelineItemsResolverByActorIds } from '../timeline/timelineItemsResolverByActorIds.ts';

describe('D1 timeline and posting adapters', () => {
  it('persists a local post and its event in one D1 batch', async () => {
    const insert = vi.fn((table: unknown) => ({
      values: (values: unknown) => ({ table, values }),
    }));
    const batch = vi.fn(async (_queries: unknown[]) => []);
    const db = { insert, batch } as unknown as IoriD1Db;
    const now = Instant.now();
    const event = Post.createPost(now)({
      actorId: ActorId.generate(),
      content: 'Hello from D1',
      userId: UserId.generate(),
    });
    if (event.aggregateState.type !== 'local') {
      throw new Error('Expected a local post');
    }

    const result = await createD1PostCreatedStore(db).store(event);

    expect(result.ok).toBe(true);
    const [postInsert, localPostInsert, eventInsert] = batch.mock.calls[0][0] as Array<{
      values: Record<string, unknown>;
    }>;
    expect(postInsert.values).toMatchObject({
      postId: event.aggregateState.postId,
      actorId: event.aggregateState.actorId,
      content: 'Hello from D1',
      type: 'local',
    });
    expect(localPostInsert.values).toEqual({
      postId: event.aggregateState.postId,
      userId: event.aggregateState.userId,
      inReplyToUri: null,
    });
    expect(eventInsert.values).toMatchObject({
      eventId: event.eventId,
      aggregateState: JSON.stringify(event.aggregateState),
      eventPayload: JSON.stringify(event.eventPayload),
    });
  });

  it('persists a timeline item and post images with their original metadata', async () => {
    const values = vi.fn((input: unknown) => ({ input }));
    const insert = vi.fn((_table: unknown) => ({
      values,
    }));
    const batch = vi.fn(async (_queries: unknown[]) => []);
    const db = { insert, batch } as unknown as IoriD1Db;
    const now = Instant.now();
    const postEvent = Post.createPost(now)({
      actorId: ActorId.generate(),
      content: 'Post with image',
      userId: UserId.generate(),
    });
    const timelineEvent = TimelineItem.createTimelineItem({
      timelineItemId: TimelineItemId.generate(),
      type: 'post',
      actorId: postEvent.aggregateState.actorId,
      postId: postEvent.aggregateState.postId,
      repostId: null,
      createdAt: now,
    }, now);
    const image = {
      imageId: ImageId.generate(),
      postId: postEvent.aggregateState.postId,
      url: '/uploads/image.webp',
      altText: 'A post image',
      createdAt: now,
    };

    const timelineResult = await createD1TimelineItemCreatedStore(db).store(timelineEvent);
    await createD1PostImageCreatedStore(db).store([image]);

    expect(timelineResult.ok).toBe(true);
    expect(values.mock.calls[0][0]).toMatchObject({
      timelineItemId: timelineEvent.aggregateState.timelineItemId,
      postId: postEvent.aggregateState.postId,
      type: 'post',
    });
    expect(values.mock.calls.at(-1)?.[0]).toEqual([{
      ...image,
      createdAt: new Date(now),
    }]);
  });

  it('returns an empty timeline without querying D1 when no actors are requested', async () => {
    const select = vi.fn();
    const db = { select } as unknown as IoriD1Db;

    const result = await createD1TimelineItemsResolverByActorIds(db).resolve({
      actorIds: [],
      currentActorId: undefined,
      createdAt: undefined,
      mutedActorIds: [],
    });

    expect(result).toEqual({ ok: true, val: [], err: undefined });
    expect(select).not.toHaveBeenCalled();
  });

  it('maps a non-empty local timeline row with its author and reaction metadata', async () => {
    const actorId = ActorId.generate();
    const userId = UserId.generate();
    const postId = Post.createPost(Instant.now())({
      actorId,
      content: 'unused',
      userId,
    }).aggregateState.postId;
    const timelineItemId = TimelineItemId.generate();
    const createdAt = new Date('2026-08-05T00:00:00.000Z');
    const results = [
      [{
        timeline_items: {
          timelineItemId,
          type: 'post',
          actorId,
          postId,
          repostId: null,
          createdAt,
        },
        posts: { postId, actorId, content: 'Hello timeline', createdAt },
        local_posts: { userId, inReplyToUri: null },
        remote_posts: null,
        actors: { actorId, logoUri: null },
        users: { username: 'kosui' },
        remote_actors: null,
        reposts: null,
        likes: null,
      }],
      [],
      [{ postId, count: 2 }],
      [{ postId, count: 1 }],
      [{
        postId,
        emoji: ':+1:',
        emojiImageUrl: null,
        count: 3,
      }],
      [],
    ] as unknown[][];
    const select = vi.fn(() => {
      const result = results.shift() ?? [];
      const builder = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        limit: () => builder,
        groupBy: () => builder,
        orderBy: async () => result,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    });
    const db = { select } as unknown as IoriD1Db;

    const result = await createD1TimelineItemsResolverByActorIds(db).resolve({
      actorIds: [actorId],
      currentActorId: undefined,
      createdAt: undefined,
      mutedActorIds: [],
    });

    expect(result).toMatchObject({
      ok: true,
      val: [{
        type: 'post',
        timelineItemId,
        post: {
          postId,
          username: 'kosui',
          content: 'Hello timeline',
          likeCount: 2,
          repostCount: 1,
          reactions: [{ emoji: ':+1:', count: 3 }],
        },
      }],
    });
  });
});
