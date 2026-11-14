import { describe, expect, it, vi } from 'vitest';

import { createWorkersAiTextGenerator } from './workersAiTextGenerator.ts';

const summarizeRequest = {
  model: 'test-model',
  instruction: 'Summarize.',
  documents: ['first', 'second'],
  maxOutputTokens: 256,
};
const generateRequest = { model: 'test-model', instruction: 'Write.', input: 'topic', maxOutputTokens: 128 };

describe('createWorkersAiTextGenerator summarize', () => {
  it('joins documents and returns the response text', async () => {
    const run = vi.fn(async () => ({ response: 'summary' }));
    const result = await createWorkersAiTextGenerator({ run }).summarize(summarizeRequest);
    expect(result).toEqual({ ok: true, val: 'summary' });
    expect(run).toHaveBeenCalledWith('test-model', {
      messages: [
        { role: 'system', content: 'Summarize.' },
        { role: 'user', content: 'first\n\n---\n\nsecond' },
      ],
      max_tokens: 256,
    });
  });

  it('reads the choices format when response is absent', async () => {
    const run = vi.fn(async () => ({ choices: [{ message: { content: 'from choices' } }] }));
    const result = await createWorkersAiTextGenerator({ run }).summarize(summarizeRequest);
    expect(result).toEqual({ ok: true, val: 'from choices' });
  });

  it('returns a JSON string when response is an already parsed array', async () => {
    const run = vi.fn(async () => ({ response: ['a', 'b'] }));
    const result = await createWorkersAiTextGenerator({ run }).generate(generateRequest);
    expect(result).toEqual({ ok: true, val: '["a","b"]' });
    if (result.ok) expect(JSON.parse(result.val)).toEqual(['a', 'b']);
  });

  it.each([{}, { response: '' }, { response: 1 }, { choices: [] }, { choices: [{ message: { content: '' } }] }, null])(
    'returns AiError for an empty or malformed response %j',
    async (raw) => {
      const run = vi.fn(async () => raw);
      const result = await createWorkersAiTextGenerator({ run }).summarize(summarizeRequest);
      expect(result).toMatchObject({ ok: false, err: { type: 'AiError' } });
    },
  );

  it('returns AiError when run throws', async () => {
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    const result = await createWorkersAiTextGenerator({ run }).summarize(summarizeRequest);
    expect(result).toEqual({ ok: false, err: { type: 'AiError', message: 'boom' } });
  });

  it('does not call run when documents are empty', async () => {
    const run = vi.fn(async () => ({ response: 'unused' }));
    const result = await createWorkersAiTextGenerator({ run }).summarize({ ...summarizeRequest, documents: [] });
    expect(result).toMatchObject({ ok: false, err: { type: 'AiError' } });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('createWorkersAiTextGenerator generate', () => {
  it('sends the instruction and input as messages and returns the response text', async () => {
    const run = vi.fn(async () => ({ response: 'generated' }));
    const result = await createWorkersAiTextGenerator({ run }).generate(generateRequest);
    expect(result).toEqual({ ok: true, val: 'generated' });
    expect(run).toHaveBeenCalledWith('test-model', {
      messages: [
        { role: 'system', content: 'Write.' },
        { role: 'user', content: 'topic' },
      ],
      max_tokens: 128,
    });
  });

  it.each([
    { choices: [{ message: { content: '', reasoning_content: '考え中' } }] },
    { choices: [{ message: { content: null, reasoning_content: '考え中' } }] },
  ])('reports only reasoning content when the body is empty for %j', async (raw) => {
    const run = vi.fn(async () => raw);
    const result = await createWorkersAiTextGenerator({ run }).generate(generateRequest);
    expect(result).toEqual({
      ok: false,
      err: { type: 'AiError', message: 'Workers AI returned only reasoning content.' },
    });
  });

  it('keeps the no text message when reasoning content is empty', async () => {
    const run = vi.fn(async () => ({ choices: [{ message: { content: '', reasoning_content: '' } }] }));
    const result = await createWorkersAiTextGenerator({ run }).generate(generateRequest);
    expect(result).toEqual({ ok: false, err: { type: 'AiError', message: 'Workers AI returned no text.' } });
  });

  it('does not call run when input is empty', async () => {
    const run = vi.fn(async () => ({ response: 'unused' }));
    const result = await createWorkersAiTextGenerator({ run }).generate({ ...generateRequest, input: '' });
    expect(result).toMatchObject({ ok: false, err: { type: 'AiError' } });
    expect(run).not.toHaveBeenCalled();
  });
});
