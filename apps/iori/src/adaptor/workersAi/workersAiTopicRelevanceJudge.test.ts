import { describe, expect, it, vi } from 'vitest';

import { createWorkersAiTopicRelevanceJudge } from './workersAiTopicRelevanceJudge.ts';

const request = {
  model: 'typesafe/jev',
  topic: { name: '生成 AI', description: '大規模言語モデルの話' },
  article: { title: 'LLM の新機能', excerpt: '冒頭の本文' },
};

describe('createWorkersAiTopicRelevanceJudge', () => {
  it('トピックを指示に入れて呼び、answers の noul の値を返す', async () => {
    const run = vi.fn(async () => ({
      model: 'typesafe/jev',
      answers: { topicRelevance: { type: 'noul', noul: 0.83 } },
      usage: { input_tokens: 10, output_tokens: 1 },
    }));

    const result = await createWorkersAiTopicRelevanceJudge({ run }).judge(request);

    expect(result).toEqual({ ok: true, val: { noul: 0.83 } });
    const [, input] = run.mock.calls[0] as unknown as [string, Record<string, unknown>];
    const questions = input.questions as Record<string, { instructions: string }>;
    expect(questions.topicRelevance!.instructions).toContain('生成 AI');
    expect(questions.topicRelevance!.instructions).toContain('大規模言語モデルの話');
  });

  it.each([
    null,
    {},
    { answers: {} },
    { answers: { topicRelevance: {} } },
    { answers: { topicRelevance: { noul: '0.5' } } },
    { answers: { topicRelevance: { noul: null } } },
    { answers: { topicRelevance: { type: 'noul', noul: 1.01 } } },
    { answers: { topicRelevance: { type: 'noul', noul: -0.01 } } },
  ])('想定と違う応答 %j は AiError にする', async (raw) => {
    const run = vi.fn(async () => raw);

    const result = await createWorkersAiTopicRelevanceJudge({ run }).judge(request);

    expect(result).toMatchObject({ ok: false, err: { type: 'AiError' } });
  });

  it.each([0, 1])('範囲の端 %d は受け付ける', async (noul) => {
    const run = vi.fn(async () => ({
      model: 'typesafe/jev',
      answers: { topicRelevance: { type: 'noul', noul } },
      usage: { input_tokens: 10, output_tokens: 1 },
    }));

    const result = await createWorkersAiTopicRelevanceJudge({ run }).judge(request);

    expect(result).toEqual({ ok: true, val: { noul } });
  });

  it('run が例外を投げたら AiError にする', async () => {
    const run = vi.fn(async () => {
      throw new Error('boom');
    });

    const result = await createWorkersAiTopicRelevanceJudge({ run }).judge(request);

    expect(result).toEqual({ ok: false, err: { type: 'AiError', message: 'boom' } });
  });
});
