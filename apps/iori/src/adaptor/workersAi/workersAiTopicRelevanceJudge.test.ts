import { describe, expect, it, vi } from 'vitest';

import { createWorkersAiTopicRelevanceJudge } from './workersAiTopicRelevanceJudge.ts';

const request = {
  model: 'typesafe/jev',
  topic: { name: '生成 AI', description: '大規模言語モデルの話' },
  article: { title: 'LLM の新機能', excerpt: '冒頭の本文' },
};

describe('createWorkersAiTopicRelevanceJudge', () => {
  it('Noul の質問を1つ入れて呼び、answers の noul の値を返す', async () => {
    const run = vi.fn(async () => ({
      model: 'typesafe/jev',
      answers: { topicRelevance: { noul: 0.83 } },
      usage: { total_tokens: 10 },
    }));

    const result = await createWorkersAiTopicRelevanceJudge({ run }).judge(request);

    expect(result).toEqual({ ok: true, val: { noul: 0.83 } });
    expect(run).toHaveBeenCalledTimes(1);
    const [model, input] = run.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(model).toBe('typesafe/jev');
    expect(input.state).toEqual({ title: 'LLM の新機能', excerpt: '冒頭の本文' });
    const questions = input.questions as Record<string, { type: string; instructions: string; criteria: object }>;
    expect(Object.keys(questions)).toEqual(['topicRelevance']);
    expect(questions.topicRelevance).toMatchObject({ type: 'noul' });
    expect(questions.topicRelevance!.instructions).toContain('生成 AI');
    expect(questions.topicRelevance!.instructions).toContain('大規模言語モデルの話');
    expect(Object.keys(questions.topicRelevance!.criteria)).toEqual(['true', 'false']);
  });

  it.each([
    null,
    {},
    { answers: {} },
    { answers: { topicRelevance: {} } },
    { answers: { topicRelevance: { noul: '0.5' } } },
    { answers: { topicRelevance: { noul: null } } },
  ])('想定と違う応答 %j は AiError にする', async (raw) => {
    const run = vi.fn(async () => raw);

    const result = await createWorkersAiTopicRelevanceJudge({ run }).judge(request);

    expect(result).toMatchObject({ ok: false, err: { type: 'AiError' } });
  });

  it('run が例外を投げたら AiError にする', async () => {
    const run = vi.fn(async () => {
      throw new Error('boom');
    });

    const result = await createWorkersAiTopicRelevanceJudge({ run }).judge(request);

    expect(result).toEqual({ ok: false, err: { type: 'AiError', message: 'boom' } });
  });
});
