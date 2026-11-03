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

  it('splits 250 texts into three runs and keeps the order', async () => {
    const run = vi.fn(async (_model: string, input: Record<string, unknown>) => ({
      data: (input.text as string[]).map((text) => [Number(text)]),
    }));
    const texts = Array.from({ length: 250 }, (_, index) => String(index));
    const result = await createWorkersAiEmbedder({ run }).embed({ model: 'embed-model', texts });
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.map(([, input]) => (input.text as string[]).length)).toEqual([100, 100, 50]);
    expect(result).toEqual({ ok: true, val: texts.map((text) => [Number(text)]) });
  });

  it('returns AiError for the whole request when one run fails', async () => {
    const run = vi.fn(async (_model: string, input: Record<string, unknown>) => {
      if (run.mock.calls.length === 2) throw new Error('second run failed');
      return { data: (input.text as string[]).map(() => [0]) };
    });
    const texts = Array.from({ length: 250 }, (_, index) => String(index));
    const result = await createWorkersAiEmbedder({ run }).embed({ model: 'embed-model', texts });
    expect(result).toEqual({ ok: false, err: { type: 'AiError', message: 'second run failed' } });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not call run for empty texts', async () => {
    const run = vi.fn(async () => ({ data: [] }));
    const result = await createWorkersAiEmbedder({ run }).embed({ model: 'embed-model', texts: [] });
    expect(result).toEqual({ ok: true, val: [] });
    expect(run).not.toHaveBeenCalled();
  });
});
