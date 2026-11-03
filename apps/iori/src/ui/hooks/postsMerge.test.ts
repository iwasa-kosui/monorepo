import { describe, expect, it } from 'vitest';

import type { PostWithAuthor } from '../../domain/post/post.ts';
import { appendUniquePosts } from './postsMerge.ts';

const post = (postId: string): PostWithAuthor => ({ postId }) as unknown as PostWithAuthor;

const ids = (posts: readonly PostWithAuthor[]) => posts.map((p) => p.postId);

describe('appendUniquePosts', () => {
  it('appends new posts after the existing ones', () => {
    const merged = appendUniquePosts([post('a'), post('b')], [post('c')]);

    expect(ids(merged)).toEqual(['a', 'b', 'c']);
  });

  it('drops incoming posts whose id already exists and keeps the order', () => {
    const merged = appendUniquePosts([post('a'), post('b')], [post('b'), post('c')]);

    expect(ids(merged)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a single post when the same id appears twice in the incoming posts', () => {
    const merged = appendUniquePosts([post('a')], [post('b'), post('b')]);

    expect(ids(merged)).toEqual(['a', 'b']);
  });
});
