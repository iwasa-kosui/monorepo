import { describe, expect, it } from 'vitest';

import type { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import type { LocalPost, RemotePost } from '../../post/post.ts';
import { PostId } from '../../post/postId.ts';
import type { Visibility } from '../../post/visibility.ts';
import { isTranslatable } from '../isTranslatable.ts';

const localPost = (visibility: Visibility = 'public'): LocalPost => ({
  type: 'local',
  visibility,
  summary: null,
  sensitive: false,
  postId: PostId.generate(),
  actorId: crypto.randomUUID() as ActorId,
  content: '<p>hello</p>',
  createdAt: Instant.orThrow(1),
  userId: crypto.randomUUID() as LocalPost['userId'],
  inReplyToUri: null,
});

const remotePost = (visibility: Visibility | null): RemotePost => ({
  type: 'remote',
  summary: null,
  sensitive: false,
  postId: PostId.generate(),
  actorId: crypto.randomUUID() as ActorId,
  content: '<p>hello</p>',
  createdAt: Instant.orThrow(1),
  uri: 'https://remote.example/notes/1',
  inReplyToUri: null,
  visibility,
});

describe('isTranslatable', () => {
  it.each<[Visibility, boolean]>([
    ['public', true],
    ['unlisted', true],
    ['private', true],
    ['direct', false],
  ])('ローカルの投稿は公開範囲が %s のとき %s', (visibility, expected) => {
    expect(isTranslatable(localPost(visibility))).toBe(expected);
  });

  it.each<[Visibility | null, boolean]>([
    ['public', true],
    ['unlisted', true],
    ['private', true],
    ['direct', false],
    [null, true],
  ])('リモートの投稿は公開範囲が %s のとき %s', (visibility, expected) => {
    expect(isTranslatable(remotePost(visibility))).toBe(expected);
  });
});
