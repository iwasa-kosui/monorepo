import { describe, expect, it } from 'vitest';

import { FeedEntryId } from '../feedEntry/feedEntryId.ts';
import { XUsername } from '../feedSource/xUsername.ts';
import { Instant } from '../instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../interestSource/embedding.ts';
import { InterestSourceId } from '../interestSource/interestSourceId.ts';
import type { InterestVector } from '../recommendation/recommendation.ts';
import type { XPost } from './digestMaterial.ts';
import { selectXPosts } from './xPostSelection.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 5));
const basis = (index: number) => Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === index ? 1 : 0));

const post = (n: number, options: Partial<Pick<XPost, 'postedAt' | 'embedding'>> = {}): XPost => ({
  feedEntryId: FeedEntryId.orThrow(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`),
  username: XUsername.parseOrThrow('jack'),
  url: `https://x.com/jack/status/${n}`,
  title: `post ${n}`,
  postedAt: options.postedAt ?? Instant.orThrow(NOW - n * 1000),
  embedding: options.embedding === undefined ? basis(0) : options.embedding,
});

const material = (kind: InterestVector['kind'], embedding: Float32Array): InterestVector => ({
  interestSourceId: InterestSourceId.generate(),
  kind,
  weight: 1,
  occurredAt: NOW,
  embedding,
});

const titles = (posts: ReadonlyArray<XPost>) => posts.map((p) => p.title);

describe('selectXPosts', () => {
  it('件数が上限以下なら、関心の材料にかかわらず新しい順に全件を返す', () => {
    const posts = [post(3), post(1), post(2)];

    expect(titles(selectXPosts({ posts, materials: [material('own_post', basis(5))], now: NOW, limit: 3 }))).toEqual([
      'post 1',
      'post 2',
      'post 3',
    ]);
  });

  it('同じ時刻なら feedEntryId の順に並べる', () => {
    const at = Instant.orThrow(NOW - 1000);

    expect(
      titles(
        selectXPosts({
          posts: [post(2, { postedAt: at }), post(1, { postedAt: at })],
          materials: [],
          now: NOW,
          limit: 5,
        }),
      ),
    )
      .toEqual(['post 1', 'post 2']);
  });

  it('上限を超えるなら、関心の材料との類似度が高い投稿を先に選ぶ', () => {
    const posts = [
      post(1, { embedding: basis(1) }),
      post(2, { embedding: basis(0) }),
      post(3, { embedding: basis(2) }),
    ];

    expect(titles(selectXPosts({ posts, materials: [material('own_post', basis(0))], now: NOW, limit: 2 }))).toEqual([
      'post 2',
      'post 1',
    ]);
  });

  it('上限を超えて関心の材料が無ければ、新しい順に上限件数を選ぶ', () => {
    const posts = [post(3), post(1), post(2)];

    expect(titles(selectXPosts({ posts, materials: [], now: NOW, limit: 2 }))).toEqual(['post 1', 'post 2']);
  });

  it('上限を超えて関心なしの材料だけなら、新しい順に上限件数を選ぶ', () => {
    const posts = [post(3), post(1), post(2)];

    expect(titles(selectXPosts({ posts, materials: [material('feedback_negative', basis(0))], now: NOW, limit: 2 })))
      .toEqual(['post 1', 'post 2']);
  });

  it('上限を超えて埋め込みのある投稿が無ければ、新しい順に上限件数を選ぶ', () => {
    const posts = [post(3, { embedding: null }), post(1, { embedding: null }), post(2, { embedding: null })];

    expect(titles(selectXPosts({ posts, materials: [material('own_post', basis(0))], now: NOW, limit: 2 }))).toEqual([
      'post 1',
      'post 2',
    ]);
  });

  it('上限を超えて埋め込み済みの投稿が上限より少なければ、残りを新しい順に足して上限件数にする', () => {
    const posts = [
      post(1, { embedding: null }),
      post(2, { embedding: basis(0) }),
      post(3, { embedding: null }),
      post(4, { embedding: null }),
    ];

    const selected = selectXPosts({ posts, materials: [material('own_post', basis(0))], now: NOW, limit: 3 });

    expect(titles(selected)).toEqual(['post 2', 'post 1', 'post 3']);
  });

  it('投稿が無ければ空を返す', () => {
    expect(selectXPosts({ posts: [], materials: [], now: NOW, limit: 10 })).toEqual([]);
  });
});
