import { RA } from '@iwasa-kosui/result';

import type { AgentChatModel, AgentMessage, AgentToolSpec } from '../../ports/agentChatModel.ts';
import type { AiError, AiModelName } from '../../ports/aiError.ts';

/** モデルが呼び出せる道具。run は失敗しても例外を投げず、モデルに読ませる文を返す */
export type AgentTool = AgentToolSpec & Readonly<{ run: (args: unknown) => Promise<string> }>;

export type AgentToolInvocation = Readonly<{ name: string; arguments: unknown; result: string }>;

export type AgentLoopInput = Readonly<{
  model: AiModelName;
  system: string;
  input: string;
  tools: readonly AgentTool[];
  maxSteps: number;
  maxOutputTokens: number;
}>;

export type AgentLoopResult = Readonly<{
  answer: string | undefined;
  invocations: readonly AgentToolInvocation[];
}>;

/** 1 回の応答で実行する道具の呼び出しの上限。モデルが同じ呼び出しを大量に並べたときに備える */
export const MAX_TOOL_CALLS_PER_STEP = 4;

/** 道具の結果をモデルに渡すときの文字数の上限 */
export const MAX_TOOL_RESULT_CHARS = 6000;

export const FINAL_ANSWER_INSTRUCTION =
  'これ以上は道具を使えません。ここまでに分かったことだけで、最終的な答えを書いてください。';

/** モデルが道具を正しく呼ばず、本文に呼び出しを書いてしまったときに返す指示 */
export const TOOL_CALL_AS_TEXT_INSTRUCTION =
  '本文に道具の呼び出しが書かれています。道具は本文に書かず、道具の呼び出しの機能で呼んでください。'
  + '道具が要らなければ、投稿する本文だけを書いてください。';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 本文に道具の呼び出し（`get_post(postId=...)` や `{"name": "get_post", ...}`）が書かれているかを調べる。
 * モデルが道具を正しく呼ばずに本文へ書くと、それがそのまま投稿されてしまうため。
 */
export const containsToolCallText = (content: string, toolNames: readonly string[]): boolean =>
  toolNames.some((name) => {
    const escaped = escapeRegExp(name);
    return new RegExp(`(?<![\\w])${escaped}\\s*\\(`).test(content)
      || new RegExp(`"name"\\s*:\\s*"${escaped}"`).test(content);
  });

const truncate = (text: string, max: number): string => text.length <= max ? text : `${text.slice(0, max)}\n…(省略)`;

const runTool = async (tools: readonly AgentTool[], name: string, args: unknown): Promise<string> => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) return `エラー: ${name} という道具はありません。`;
  try {
    return truncate(await tool.run(args), MAX_TOOL_RESULT_CHARS);
  } catch (error) {
    return `エラー: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/**
 * 道具を使うエージェントのループ。
 * モデルが道具を呼ぶ限り実行して結果を返し、道具を呼ばずに答えたらその文を最終的な答えにする。
 * 本文に道具の呼び出しを書いてきたときは答えとみなさず、正しく呼ぶよう指示してもう一度呼ぶ。
 * maxSteps 回で終わらなければ、道具を渡さずにもう 1 回だけ呼び、答えを書かせる。
 */
export const runAgentLoop = (chatModel: AgentChatModel) =>
async (
  { model, system, input, tools, maxSteps, maxOutputTokens }: AgentLoopInput,
): RA<AgentLoopResult, AiError> => {
  const messages: AgentMessage[] = [{ role: 'system', content: system }, { role: 'user', content: input }];
  const invocations: AgentToolInvocation[] = [];
  const specs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const toolNames = tools.map((tool) => tool.name);
  const isToolCallText = (content: string | undefined): boolean =>
    content !== undefined && containsToolCallText(content, toolNames);

  for (let step = 0; step < maxSteps; step++) {
    const response = await chatModel.chat({ model, messages, tools: specs, maxOutputTokens });
    if (!response.ok) return response;
    const toolCalls = response.val.toolCalls.slice(0, MAX_TOOL_CALLS_PER_STEP);
    if (toolCalls.length === 0) {
      if (!isToolCallText(response.val.content)) return RA.ok({ answer: response.val.content, invocations });
      messages.push({ role: 'assistant', content: response.val.content ?? '', toolCalls: [] });
      messages.push({ role: 'user', content: TOOL_CALL_AS_TEXT_INSTRUCTION });
      continue;
    }

    messages.push({ role: 'assistant', content: response.val.content ?? '', toolCalls });
    for (const call of toolCalls) {
      const result = await runTool(tools, call.name, call.arguments);
      invocations.push({ name: call.name, arguments: call.arguments, result });
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result });
    }
  }

  messages.push({ role: 'user', content: FINAL_ANSWER_INSTRUCTION });
  const final = await chatModel.chat({ model, messages, tools: [], maxOutputTokens });
  if (!final.ok) return final;
  const answer = final.val.toolCalls.length === 0 && !isToolCallText(final.val.content)
    ? final.val.content
    : undefined;
  return RA.ok({ answer, invocations });
};
