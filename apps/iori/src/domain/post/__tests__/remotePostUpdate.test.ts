import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { Post } from '../post.ts';

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
    recipientActorUris: ['https://iori.test/users/kosui'],
    previousRecipientActorUris: ['https://iori.test/users/hanako'],
  };

  it('本文、CW、センシティブ、編集時刻だけを変え、公開範囲、返信先、作成時刻は変えない', () => {
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
