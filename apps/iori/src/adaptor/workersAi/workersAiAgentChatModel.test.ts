import { describe, expect, it } from 'vitest';

import type { AgentMessage } from '../../ports/agentChatModel.ts';
import { createWorkersAiAgentChatModel } from './workersAiAgentChatModel.ts';

const recording = (response: unknown) => {
  const inputs: Record<string, unknown>[] = [];
  const model = createWorkersAiAgentChatModel({
    run: async (_model, input) => {
      inputs.push(input);
      return response;
    },
  });
  return { model, inputs };
};

const ask = (messages: readonly AgentMessage[] = [{ role: 'user', content: 'hi' }]) => ({
  model: 'test-model',
  messages,
  tools: [],
  maxOutputTokens: 100,
});

describe('createWorkersAiAgentChatModel', () => {
  it('推論モデルが考えた内容は本文に混ぜず、reasoning として返す', async () => {
    const { model } = recording({
      choices: [{
        message: {
          content: '<think>どう答えるか考える</think>こんにちは',
          reasoning: '挨拶なので短く返す',
          tool_calls: [{ id: 'c1', function: { name: 'reply', arguments: '{"text":"やあ"}' } }],
        },
      }],
    });

    const result = await model.chat(ask());

    expect(result.ok && result.val).toEqual({
      content: 'こんにちは',
      reasoning: '挨拶なので短く返す',
      toolCalls: [{ id: 'c1', name: 'reply', arguments: { text: 'やあ' } }],
    });
  });

  it('考えただけで本文もツールの呼び出しも無ければ、失敗にする（考えた内容を投稿しない）', async () => {
    const { model } = recording({ choices: [{ message: { content: '<think>途中で切れた', reasoning: '…' } }] });

    expect((await model.chat(ask())).ok).toBe(false);
  });

  it('推論の強さを渡し、ツールを呼んだときに考えた内容を次の呼び出しでモデルへ返す', async () => {
    const { model, inputs } = recording({ choices: [{ message: { content: 'ok' } }] });

    await model.chat({
      ...ask([
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          reasoning: '投稿を読んでから答える',
          toolCalls: [{ id: 'c1', name: 'get_post', arguments: { postId: 'x' } }],
        },
        { role: 'tool', toolCallId: 'c1', name: 'get_post', content: '本文' },
      ]),
      reasoningEffort: 'high',
    });

    expect(inputs[0]?.['reasoning_effort']).toBe('high');
    expect((inputs[0]?.['messages'] as Record<string, unknown>[])[1]?.['reasoning_content'])
      .toBe('投稿を読んでから答える');
  });

  it('推論の強さを指定しなければ、推論しないモデルにも渡せるよう送らない', async () => {
    const { model, inputs } = recording({ choices: [{ message: { content: 'ok' } }] });

    await model.chat(ask());

    expect(inputs[0]).not.toHaveProperty('reasoning_effort');
  });
});
