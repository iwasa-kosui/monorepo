import { describe, expect, it } from 'vitest';

import { agentModelOf, allowedAgentModels, defaultAgentModel, isUpstreamLimit, moveOf } from './model.ts';

const openAiShape = (name: string, args: unknown) => ({
  choices: [{
    message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }] },
  }],
});

describe('moveOf が読む tool_calls の形', () => {
  it('OpenAI 形（choices[0].message.tool_calls、arguments は JSON 文字列）', () => {
    expect(moveOf(openAiShape('say', JSON.stringify({ message: 'はい' })))).toEqual({ kind: 'message', text: 'はい' });
  });

  it('OpenAI 形で、arguments がオブジェクト', () => {
    expect(moveOf(openAiShape('say', { message: 'はい' }))).toEqual({ kind: 'message', text: 'はい' });
  });

  it('Workers AI 独自形（トップレベルの tool_calls、arguments はオブジェクト）', () => {
    expect(moveOf({ response: null, tool_calls: [{ name: 'say', arguments: { message: 'はい' } }] })).toEqual({
      kind: 'message',
      text: 'はい',
    });
  });

  it('Workers AI 独自形で、arguments が JSON 文字列', () => {
    expect(moveOf({ response: '', tool_calls: [{ name: 'finish', arguments: '{"message":"完了"}' }] })).toEqual({
      kind: 'done',
      text: '完了',
    });
  });

  it('トップレベルの tool_calls が OpenAI 形の要素（function.name）でも読む', () => {
    const raw = { tool_calls: [{ function: { name: 'run_tests', arguments: '{}' } }] };
    expect(moveOf(raw)).toEqual({ kind: 'run_tests', text: '' });
  });

  it('choices[0].message の content が文字列で、ツールの呼び出しが無ければ message', () => {
    expect(moveOf({ choices: [{ message: { content: '本文です' } }] })).toEqual({ kind: 'message', text: '本文です' });
  });

  it('トップレベルの response だけでも message', () => {
    expect(moveOf({ response: '本文です' })).toEqual({ kind: 'message', text: '本文です' });
  });

  it('replace_visits は、OpenAI 形でも独自形でも全文を返す', () => {
    const args = { message: '直しました', code: 'const a = 1;' };
    const expected = { kind: 'replace', text: '直しました', code: 'const a = 1;' };
    expect(moveOf(openAiShape('replace_visits', JSON.stringify(args)))).toEqual(expected);
    expect(moveOf({ tool_calls: [{ name: 'replace_visits', arguments: args }] })).toEqual(expected);
  });

  it('壊れた arguments の say は、本文があればそれを使う', () => {
    const raw = {
      choices: [{ message: { content: '本文', tool_calls: [{ function: { name: 'say', arguments: '{' } }] } }],
    };
    expect(moveOf(raw)).toEqual({ kind: 'message', text: '本文' });
  });
});

describe('agentModelOf', () => {
  it('未設定のときは、既定のモデル', () => {
    expect(agentModelOf(undefined)).toBe(defaultAgentModel);
    expect(defaultAgentModel).toBe('@cf/openai/gpt-oss-120b');
  });

  it('許可リストの 3 つはそのまま使う', () => {
    expect(allowedAgentModels).toEqual([
      '@cf/openai/gpt-oss-120b',
      '@cf/openai/gpt-oss-20b',
      '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
    ]);
    for (const model of allowedAgentModels) {
      expect(agentModelOf(model)).toBe(model);
    }
  });

  it('許可リストに無い値と空文字は、既定のモデル', () => {
    expect(agentModelOf('@cf/example/other')).toBe(defaultAgentModel);
    expect(agentModelOf('')).toBe(defaultAgentModel);
  });
});

describe('isUpstreamLimit', () => {
  it('状態 429、または rate limit・429・capacity を含むメッセージのときだけ true', () => {
    expect(isUpstreamLimit(Object.assign(new Error('x'), { status: 429 }))).toBe(true);
    expect(isUpstreamLimit(new Error('Rate Limit exceeded'))).toBe(true);
    expect(isUpstreamLimit(new Error('Capacity temporarily exceeded'))).toBe(true);
    expect(isUpstreamLimit({ message: 'status 429' })).toBe(true);
    expect(isUpstreamLimit(new Error('InferenceUpstreamError'))).toBe(false);
    expect(isUpstreamLimit('rate limit')).toBe(false);
    expect(isUpstreamLimit(null)).toBe(false);
  });
});
