import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { UserId } from '../../user/userId.ts';
import { LocalPost, Post, RemotePost } from '../post.ts';
import { PostId } from '../postId.ts';
import type { Visibility } from '../visibility.ts';

const localPostFields = () => ({
  type: 'local' as const,
  postId: PostId.generate(),
  actorId: ActorId.generate(),
  content: 'hi',
  createdAt: Instant.orThrow(1_000),
  userId: UserId.generate(),
  inReplyToUri: null,
  summary: null,
  sensitive: false,
});

describe('Post.isVisibleToAnonymous', () => {
  it.each(
    [
      ['public', true],
      ['unlisted', true],
      ['private', false],
      ['direct', false],
    ] as const,
  )('ローカルの投稿の visibility が %s のとき %s', (visibility, expected) => {
    expect(Post.isVisibleToAnonymous(LocalPost.orThrow({ ...localPostFields(), visibility }))).toBe(expected);
  });

  it.each(
    [
      ['public', true],
      ['unlisted', true],
      ['private', false],
      ['direct', false],
      [null, false],
    ] as const,
  )('リモートの投稿の visibility が %s のとき %s', (visibility, expected) => {
    const remote = RemotePost.orThrow({
      type: 'remote',
      postId: PostId.generate(),
      actorId: ActorId.generate(),
      content: 'hi',
      createdAt: Instant.orThrow(1_000),
      uri: 'https://remote.example/notes/1',
      inReplyToUri: null,
      visibility,
      summary: null,
      sensitive: false,
    });
    expect(Post.isVisibleToAnonymous(remote)).toBe(expected);
  });
});

describe('LocalPost の visibility', () => {
  it('visibility を持たない値は public として読む', () => {
    expect(LocalPost.orThrow(localPostFields()).visibility).toBe('public');
  });

  it('知らない visibility は受け付けない', () => {
    expect(LocalPost.parse({ ...localPostFields(), visibility: 'friends' }).ok).toBe(false);
  });
});

describe('Post.createPost の visibility', () => {
  const payload = { actorId: ActorId.generate(), userId: UserId.generate(), content: 'hi' };

  it('省略したときは public にする', () => {
    const event = Post.createPost(Instant.now())(payload);
    expect(event.aggregateState.visibility).toBe('public');
    expect(event.eventPayload.visibility).toBe('public');
  });

  it.each(['public', 'unlisted', 'private'] as const satisfies ReadonlyArray<Visibility>)(
    '%s を投稿とイベントに載せる',
    (visibility) => {
      const event = Post.createPost(Instant.now())({ ...payload, visibility });
      expect(event.aggregateState.visibility).toBe(visibility);
      expect(event.eventPayload.visibility).toBe(visibility);
    },
  );
});
