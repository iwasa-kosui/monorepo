import { describe, expect, it } from 'vitest';

import { prependUniqueById } from './prependUnique.ts';

const item = (id: string) => ({ id });

describe('prependUniqueById', () => {
  it('puts the incoming item first and keeps the order of the existing items', () => {
    const merged = prependUniqueById([item('a'), item('b')], item('c'));

    expect(merged.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not duplicate an item whose id already exists', () => {
    const existing = [item('a'), item('b')];

    const merged = prependUniqueById(existing, item('b'));

    expect(merged.map((i) => i.id)).toEqual(['a', 'b']);
    expect(merged).toBe(existing);
  });

  it('does not mutate the existing list', () => {
    const existing = [item('a')];

    prependUniqueById(existing, item('b'));

    expect(existing).toEqual([item('a')]);
  });
});
