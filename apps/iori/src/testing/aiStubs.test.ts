import { expect, it } from 'vitest';

import { createStubEmbedder } from './aiStubs.ts';

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  'createStubEmbedder throws for dimensions %s',
  (dimensions) => {
    expect(() => createStubEmbedder(dimensions)).toThrow(RangeError);
  },
);

it('createStubEmbedder returns vectors of the given dimensions', async () => {
  const { embedder, calls } = createStubEmbedder(3);
  const result = await embedder.embed({ model: 'm', texts: ['ab'] });
  expect(result).toEqual({ ok: true, val: [[97, 98, 0]] });
  expect(calls).toEqual([{ model: 'm', texts: ['ab'] }]);
});
