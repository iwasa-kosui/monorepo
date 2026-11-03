import { describe, expect, it, vi } from 'vitest';

import { createWorkersAiEmbedder } from './workersAiEmbedder.ts';

describe('createWorkersAiEmbedder', () => {
  it('returns the embeddings in the response data', async () => {
    const run = vi.fn(async () => ({ data: [[1, 2], [3, 4]] }));
    const result = await createWorkersAiEmbedder({ run }).embed({ model: 'embed-model', texts: ['a', 'b'] });
    expect(result).toEqual({ ok: true, val: [[1, 2], [3, 4]] });
    expect(run).toHaveBeenCalledWith('embed-model', { text: ['a', 'b'] });
  });

  it('returns AiError when the count differs from the texts', async () => {
    const run = vi.fn(async () => ({ data: [[1, 2]] }));
    const result = await createWorkersAiEmbedder({ run }).embed({ model: 'embed-model', texts: ['a', 'b'] });
    expect(result).toMatchObject({ ok: false, err: { type: 'AiError' } });
  });

  it.each([{}, { data: 'x' }, { data: [['a']] }, { data: [1] }, null])(
    'returns AiError for a malformed response %j',
    async (raw) => {
      const run = vi.fn(async () => raw);
      const result = await createWorkersAiEmbedder({ run }).embed({ model: 'embed-model', texts: ['a'] });
      expect(result).toMatchObject({ ok: false, err: { type: 'AiError' } });
    },
  );

  it('returns AiError when run throws', async () => {
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    const result = await createWorkersAiEmbedder({ run }).embed({ model: 'embed-model', texts: ['a'] });
    expect(result).toEqual({ ok: false, err: { type: 'AiError', message: 'boom' } });
  });

  it('does not call run for empty texts', async () => {
    const run = vi.fn(async () => ({ data: [] }));
    const result = await createWorkersAiEmbedder({ run }).embed({ model: 'embed-model', texts: [] });
    expect(result).toEqual({ ok: true, val: [] });
    expect(run).not.toHaveBeenCalled();
  });
});
