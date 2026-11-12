import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { Post } from '../post.ts';
import { Visibility } from '../visibility.ts';

const created = Post.createRemotePost(Instant.orThrow(1_000))({
  actorId: ActorId.generate(),
  content: '<p>before</p>',
  uri: 'https://remote.example/notes/1',
  visibility: 'direct',
  summary: 'cw',
  sensitive: true,
});
const post = created.aggregateState;

describe('Post.updateRemotePost', () => {
  const edit = {
    content: '<p>after</p>',
    summary: null,
    sensitive: false,
    editedAt: Instant.orThrow(5_000),
    visibility: 'direct' as const,
    recipientActorUris: ['https://iori.test/users/kosui'],
    previousRecipientActorUris: ['https://iori.test/users/hanako'],
    images: [],
  };

  it('本文、CW、センシティブ、編集時刻を変え、同じ公開範囲のままなら公開範囲、返信先、作成時刻は変えない', () => {
    const event = Post.updateRemotePost(Instant.orThrow(6_000))(post, edit);

    expect(event.eventName).toBe('post.remotePostUpdated');
    expect(event.aggregateId).toBe(post.postId);
    expect(event.occurredAt).toBe(6_000);
    expect(event.aggregateState).toEqual({
      ...post,
      content: '<p>after</p>',
      summary: null,
      sensitive: false,
      editedAt: 5_000,
    });
  });

  it('イベントの payload に更新の前と後の宛先を入れる', () => {
    const event = Post.updateRemotePost(Instant.orThrow(6_000))(post, edit);

    expect(event.eventPayload).toMatchObject({
      postId: post.postId,
      recipientActorUris: ['https://iori.test/users/kosui'],
      previousRecipientActorUris: ['https://iori.test/users/hanako'],
    });
  });
});

describe('Post.updateRemotePost の公開範囲', () => {
  const edit = {
    content: '<p>after</p>',
    summary: null,
    sensitive: false,
    editedAt: Instant.orThrow(5_000),
    recipientActorUris: [],
    previousRecipientActorUris: [],
    images: [],
  };

  it('Update の宛先が狭ければ公開範囲を狭め、広ければ変えない', () => {
    const narrowed = Post.updateRemotePost(Instant.orThrow(6_000))({ ...post, visibility: 'public' }, {
      ...edit,
      visibility: 'private',
    });
    const kept = Post.updateRemotePost(Instant.orThrow(6_000))({ ...post, visibility: 'private' }, {
      ...edit,
      visibility: 'public',
    });

    expect(narrowed.aggregateState.visibility).toBe('private');
    expect(narrowed.eventPayload.visibility).toBe('private');
    expect(kept.aggregateState.visibility).toBe('private');
  });
});

describe('Visibility.narrow', () => {
  it.each(
    [
      ['public', 'unlisted', 'unlisted'],
      ['unlisted', 'private', 'private'],
      ['private', 'direct', 'direct'],
      ['direct', 'public', 'direct'],
      ['private', 'private', 'private'],
      ['public', null, 'public'],
      [null, null, null],
      [null, 'public', null],
      [null, 'unlisted', null],
      [null, 'private', null],
      [null, 'direct', 'direct'],
    ] as const,
  )('保存済み %s と Update の %s では %s になる', (stored, incoming, expected) => {
    expect(Visibility.narrow(stored, incoming)).toBe(expected);
  });
});

describe('Post.isNewerEdit', () => {
  it('編集時刻が未保存なら、どの更新も新しい', () => {
    expect(Post.isNewerEdit(post, Instant.orThrow(0))).toBe(true);
    expect(Post.isNewerEdit({ ...post, editedAt: null }, Instant.orThrow(1))).toBe(true);
  });

  it('保存済みの編集時刻より後の更新だけが新しい', () => {
    const edited = { ...post, editedAt: Instant.orThrow(5_000) };

    expect(Post.isNewerEdit(edited, Instant.orThrow(5_001))).toBe(true);
    expect(Post.isNewerEdit(edited, Instant.orThrow(5_000))).toBe(false);
    expect(Post.isNewerEdit(edited, Instant.orThrow(4_999))).toBe(false);
  });
});
