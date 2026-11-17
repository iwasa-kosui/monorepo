import { describe, expect, it } from 'vitest';

import type { ActorId } from '../../actor/actorId.ts';
import { type Interactor, PostInteractions } from '../postInteractions.ts';

const actor = (acct: string, overrides: Partial<Interactor> = {}): Interactor => ({
  actorId: null,
  isLocal: false,
  name: acct,
  acct,
  avatarUrl: null,
  url: null,
  ...overrides,
});

describe('PostInteractions.merge', () => {
  it('手元と相手のサーバーの両方にいる人は、手元の情報で1人にまとめる', () => {
    const known = actor('Alice@Remote.Example', { actorId: 'actor-1' as ActorId });
    const merged = PostInteractions.merge(
      { likes: [known], reposts: [], reactions: [] },
      { likes: [actor('alice@remote.example'), actor('bob@remote.example')], reposts: [], reactions: [] },
    );

    expect(merged.likes).toEqual([known, actor('bob@remote.example')]);
  });

  it('同じ絵文字のリアクションは1つにまとめ、画像の URL は分かっているほうを使う', () => {
    const merged = PostInteractions.merge(
      {
        likes: [],
        reposts: [],
        reactions: [{ emoji: ':blobcat:', emojiImageUrl: null, actors: [actor('me@iori.test')] }],
      },
      {
        likes: [],
        reposts: [],
        reactions: [
          {
            emoji: ':blobcat:',
            emojiImageUrl: 'https://remote.example/emoji/blobcat.webp',
            actors: [actor('me@iori.test'), actor('alice@remote.example')],
          },
          { emoji: '👍', emojiImageUrl: null, actors: [actor('alice@remote.example')] },
        ],
      },
    );

    expect(merged.reactions).toEqual([
      {
        emoji: ':blobcat:',
        emojiImageUrl: 'https://remote.example/emoji/blobcat.webp',
        actors: [actor('me@iori.test'), actor('alice@remote.example')],
      },
      { emoji: '👍', emojiImageUrl: null, actors: [actor('alice@remote.example')] },
    ]);
  });
});
