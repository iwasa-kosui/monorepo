import { describe, expect, it } from 'vitest';

import type { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import type { LocalPost, RemotePost } from '../../post/post.ts';
import { PostId } from '../../post/postId.ts';
import type { Visibility } from '../../post/visibility.ts';
import { isSummarizable } from '../isSummarizable.ts';

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

describe('isSummarizable', () => {
  it('ローカルの投稿は要約できる', () => {
    expect(isSummarizable(localPost())).toBe(true);
  });

  it.each<[Visibility, boolean]>([
    ['public', true],
    ['unlisted', true],
    ['private', true],
    ['direct', false],
  ])('ローカルの投稿は公開範囲が %s のとき %s', (visibility, expected) => {
    expect(isSummarizable(localPost(visibility))).toBe(expected);
  });

  it.each<[Visibility | null, boolean]>([
    ['public', true],
    ['unlisted', true],
    ['private', true],
    ['direct', false],
    [null, false],
  ])('リモートの投稿は公開範囲が %s のとき %s', (visibility, expected) => {
    expect(isSummarizable(remotePost(visibility))).toBe(expected);
  });
});
