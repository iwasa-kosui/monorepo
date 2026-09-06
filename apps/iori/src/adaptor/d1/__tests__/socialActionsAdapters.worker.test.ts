import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Like } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1EmojiReactResolverByActorAndPostAndEmoji } from '../emojiReact/emojiReactResolverByActorAndPostAndEmoji.ts';
import { createD1LikedPostsResolverByActorId } from '../like/likedPostsResolverByActorId.ts';
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

  it('projects liked local posts with engagement, images, reactions, and link previews', async () => {
    const actorId = ActorId.generate();
    const postId = PostId.generate();
    const userId = UserId.generate();
    const now = new Date('2026-08-05T00:00:00.000Z');
    const db = queryDb([
      [{
        likes: { likeId: LikeId.generate(), actorId, postId, type: 'local', createdAt: now },
        posts: { postId, actorId, content: '<p>liked</p>', createdAt: now, type: 'local', deletedAt: null },
        local_posts: { postId, userId, inReplyToUri: null },
        remote_posts: null,
        actors: {
          actorId,
          uri: 'https://worker.test/users/kosui',
          logoUri: null,
          inboxUrl: 'https://worker.test/inbox',
        },
        local_actors: { actorId, userId },
        remote_actors: null,
        users: { userId, username: 'kosui' },
      }],
      [{ imageId: 'image', postId, url: 'https://worker.test/uploads/image.webp', altText: 'alt', createdAt: now }],
      [{ postId }],
      [{ postId, count: 2 }],
      [{ postId, count: 1 }],
      [{ postId, emoji: ':wave:', emojiImageUrl: null, count: 3 }],
      [{
        linkPreviewId: LinkPreviewId.generate(),
        postId,
        url: 'https://example.test',
        title: 'Example',
        description: null,
        imageUrl: null,
        faviconUrl: null,
        siteName: 'Example',
        createdAt: now,
      }],
    ]);

    const result = await createD1LikedPostsResolverByActorId(db).resolve({
      actorId,
      currentActorId: actorId,
      createdAt: undefined,
    });

    expect(result).toMatchObject({
      ok: true,
      val: [{
        postId,
        username: 'kosui',
        liked: true,
        reposted: true,
        images: [{ altText: 'alt' }],
        likeCount: 2,
        repostCount: 1,
        reactions: [{ emoji: ':wave:', count: 3 }],
        linkPreviews: [{ title: 'Example' }],
      }],
    });
  });
});
