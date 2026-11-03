import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Like } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1EmojiReactResolverByActorAndPostAndEmoji } from '../emojiReact/emojiReactResolverByActorAndPostAndEmoji.ts';
import { createD1LikeResolver } from '../like/likeResolver.ts';
import { createD1LocalLikeCreatedStore } from '../like/localLikeCreatedStore.ts';
import { createD1RepostResolver } from '../repost/repostResolver.ts';
import { createD1TimelineItemResolverByRepostId } from '../timeline/timelineItemResolverByRepostId.ts';

const queryDb = (results: unknown[][]): IoriD1Db => ({
  select: () => {
    const rows = results.shift() ?? [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      limit: () => builder,
      orderBy: () => builder,
      groupBy: () => builder,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  },
} as unknown as IoriD1Db);

describe('D1 social action adapters', () => {
  it('stores a local like in the aggregate, subtype, and event tables', async () => {
    const statements: unknown[] = [];
    const db = {
      insert: (table: unknown) => ({ values: (values: unknown) => ({ table, values }) }),
      batch: async (items: unknown[]) => statements.push(...items),
    } as unknown as IoriD1Db;
    const now = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));
    const event = Like.createLocalLike({
      likeId: LikeId.generate(),
      actorId: ActorId.generate(),
      postId: PostId.generate(),
    }, now);

    await createD1LocalLikeCreatedStore(db).store(event);

    expect(statements).toHaveLength(3);
  });

  it('resolves like, repost, emoji reaction, and repost timeline identities', async () => {
    const actorId = ActorId.generate();
    const postId = PostId.generate();
    const likeId = LikeId.generate();
    const repostId = RepostId.generate();
    const emojiReactId = EmojiReactId.generate();
    const timelineItemId = TimelineItemId.generate();
    const now = new Date('2026-08-05T00:00:00.000Z');

    const like = await createD1LikeResolver(queryDb([[{
      likes: { likeId, actorId, postId, type: 'local', createdAt: now },
      local_likes: { likeId },
      remote_likes: null,
    }]])).resolve({ actorId, postId });
    const repost = await createD1RepostResolver(queryDb([[{
      repostId,
      actorId,
      postId,
      announceActivityUri: null,
      createdAt: now,
    }]])).resolve({ actorId, postId });
    const reaction = await createD1EmojiReactResolverByActorAndPostAndEmoji(queryDb([[{
      emojiReactId,
      actorId,
      postId,
      emoji: ':wave:',
      emojiReactActivityUri: null,
      emojiImageUrl: null,
      createdAt: now,
    }]])).resolve({ actorId, postId, emoji: ':wave:' });
    const timelineItem = await createD1TimelineItemResolverByRepostId(queryDb([[{
      timelineItemId,
      type: 'repost',
      actorId,
      postId,
      repostId,
      createdAt: now,
      deletedAt: null,
    }]])).resolve({ repostId });

    expect(like).toMatchObject({ ok: true, val: { type: 'local', likeId } });
    expect(repost).toMatchObject({ ok: true, val: { repostId } });
    expect(reaction).toMatchObject({ ok: true, val: { emojiReactId, emoji: ':wave:' } });
    expect(timelineItem).toMatchObject({ ok: true, val: { timelineItemId, repostId } });
  });
});
