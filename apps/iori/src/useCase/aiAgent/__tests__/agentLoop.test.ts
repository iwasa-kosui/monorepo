import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import type { AgentChatModel, AgentChatResponse } from '../../../ports/agentChatModel.ts';
import { type AgentTool, runAgentLoop } from '../agentLoop.ts';

const getPost: AgentTool = {
  name: 'get_post',
  description: '投稿を読む',
  parameters: {
    type: 'object',
    properties: { postId: { type: 'string', description: 'postId' } },
    required: ['postId'],
  },
  run: async () => '投稿の本文',
};

/** 用意した応答を順に返すモデル */
const scripted = (...responses: AgentChatResponse[]): AgentChatModel => {
  const queue = [...responses];
  return { chat: async () => RA.ok(queue.shift() ?? { content: undefined, toolCalls: [] }) };
};

const run = (chatModel: AgentChatModel) =>
  runAgentLoop(chatModel)({
    model: 'test',
    system: 'system',
    input: 'input',
    tools: [getPost],
    maxSteps: 3,
    maxOutputTokens: 100,
  });

describe('runAgentLoop', () => {
  it('本文に道具の呼び出しを書いた応答は答えにせず、呼び直させた後の答えを返す', async () => {
    const result = await run(scripted(
      { content: 'まずは調べます。[get_post(postId=44263481-bdcd-46bb-bba9-9fdea03dc88a)]', toolCalls: [] },
      { content: undefined, toolCalls: [{ id: '1', name: 'get_post', arguments: { postId: 'x' } }] },
      { content: '調べた結果です。', toolCalls: [] },
    ));

    expect(result.ok && result.val.answer).toBe('調べた結果です。');
  });

  it('JSON の形で道具の呼び出しを本文に書き続けたら、答えなしにする', async () => {
    const pseudo = { content: '{"name": "get_post", "parameters": {"postId": "x"}}', toolCalls: [] };
    const result = await run(scripted(pseudo, pseudo, pseudo, pseudo));

    expect(result.ok && result.val.answer).toBeUndefined();
  });

  it('道具の名前に触れただけの本文は、そのまま答えにする', async () => {
    const result = await run(scripted({ content: 'get_post という道具で投稿を読めます。', toolCalls: [] }));

    expect(result.ok && result.val.answer).toBe('get_post という道具で投稿を読めます。');
  });
});
