import { describe, expect, it } from 'vitest';

import { PostId } from '../../../domain/post/postId.ts';
import { createD1StoredPostInteractionsResolver } from '../postInteraction/storedPostInteractionsResolver.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const alice = seed.addRemoteActor('alice');
  const bob = seed.addRemoteActor('bob', 'other.example');
  const resolve = async (postId: string) => {
    const resolved = await createD1StoredPostInteractionsResolver(fixture.db).resolve({
      postId: PostId.orThrow(postId),
    });
    if (!resolved.ok) throw new Error('resolve failed');
    return resolved.val;
  };
  return { fixture, seed, me, alice, bob, resolve };
};

describe('D1 の StoredPostInteractionsResolver', () => {
  it('その投稿にいいね・リポストした人だけを、新しい順に返す', async () => {
    const t = setup();
    const post = t.seed.addLocalPost(t.me, 1_000);
    const other = t.seed.addLocalPost(t.me, 2_000);
    t.seed.addLike(t.alice.actorId, post.postId, 10_000);
    t.seed.addLike(t.bob.actorId, post.postId, 20_000);
    t.seed.addLike(t.alice.actorId, other.postId, 30_000);
    t.seed.addRepost(t.bob.actorId, post.postId, 40_000, { timeline: false });

    const interactions = await t.resolve(post.postId);

    expect(interactions.likes.map((actor) => actor.acct)).toEqual(['bob@other.example', 'alice@remote.example']);
    expect(interactions.reposts.map((actor) => actor.acct)).toEqual(['bob@other.example']);
    expect(interactions.reactions).toEqual([]);
  });

  it('ローカルの人はローカルとして、リモートの人は actorId とプロフィールの URL つきで返す', async () => {
    const t = setup();
    const post = t.seed.addRemotePost(t.alice, 1_000, { visibility: 'public' });
    t.seed.addLike(t.me.actorId, post.postId, 10_000);
    t.seed.addLike(t.bob.actorId, post.postId, 5_000);

    const { likes } = await t.resolve(post.postId);

    expect(likes).toEqual([
      {
        actorId: t.me.actorId,
        isLocal: true,
        name: 'kosui',
        acct: 'kosui@iori.test',
        avatarUrl: null,
        url: 'https://iori.test/users/kosui',
      },
      {
        actorId: t.bob.actorId,
        isLocal: false,
        name: 'bob',
        acct: 'bob@other.example',
        avatarUrl: null,
        url: 'https://other.example/@bob',
      },
    ]);
  });

  it('リアクションは絵文字ごとにまとめ、画像の URL を持たせる', async () => {
    const t = setup();
    const post = t.seed.addLocalPost(t.me, 1_000);
    t.seed.addEmojiReact(t.alice.actorId, post.postId, ':blobcat:', 'https://remote.example/blobcat.png');
    t.seed.addEmojiReact(t.bob.actorId, post.postId, ':blobcat:', 'https://other.example/blobcat.png');
    t.seed.addEmojiReact(t.bob.actorId, post.postId, '👍');

    const { reactions } = await t.resolve(post.postId);

    const byEmoji = new Map(reactions.map((reaction) => [reaction.emoji, reaction]));
    expect([...byEmoji.keys()].sort()).toEqual([':blobcat:', '👍'].sort());
    expect(byEmoji.get(':blobcat:')?.actors.map((actor) => actor.acct).sort()).toEqual([
      'alice@remote.example',
      'bob@other.example',
    ]);
    expect(byEmoji.get(':blobcat:')?.emojiImageUrl).toMatch(/blobcat\.png$/);
    expect(byEmoji.get('👍')).toMatchObject({ emojiImageUrl: null, actors: [{ acct: 'bob@other.example' }] });
  });
});
