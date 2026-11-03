import { describe, expect, it } from 'vitest';

import { appendUniqueBy, appendUniqueById } from './appendUnique.ts';

const item = (id: string) => ({ id });

const ids = (items: readonly { id: string }[]) => items.map((i) => i.id);

describe('appendUniqueById', () => {
  it('appends new items after the existing ones', () => {
    const merged = appendUniqueById([item('a'), item('b')], [item('c'), item('d')]);

    expect(ids(merged)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops incoming items whose id already exists and keeps the order', () => {
    const merged = appendUniqueById([item('a'), item('b')], [item('b'), item('c')]);

    expect(ids(merged)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a single item when the same id appears twice in the incoming items', () => {
    const merged = appendUniqueById([item('a')], [item('b'), item('b')]);

    expect(ids(merged)).toEqual(['a', 'b']);
  });

  it('returns the existing items when every incoming item is a duplicate', () => {
    const merged = appendUniqueById([item('a'), item('b')], [item('a'), item('b')]);

    expect(ids(merged)).toEqual(['a', 'b']);
  });

  it('keeps the existing item when the incoming duplicate has different content', () => {
    const merged = appendUniqueById([{ id: 'a', value: 1 }], [{ id: 'a', value: 2 }]);

    expect(merged).toEqual([{ id: 'a', value: 1 }]);
  });
});

describe('appendUniqueBy', () => {
  it('drops incoming items whose key already exists', () => {
    const merged = appendUniqueBy(
      [{ postId: 'a' }, { postId: 'b' }],
      [{ postId: 'b' }, { postId: 'c' }],
      (post) => post.postId,
    );

    expect(merged.map((p) => p.postId)).toEqual(['a', 'b', 'c']);
  });
});
