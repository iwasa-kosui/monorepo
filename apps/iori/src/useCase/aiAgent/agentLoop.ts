import { RA } from '@iwasa-kosui/result';

import type { AgentChatModel, AgentMessage, AgentToolCall, AgentToolSpec } from '../../ports/agentChatModel.ts';
import type { AiError, AiModelName } from '../../ports/aiError.ts';

/** モデルが呼び出せるツール。run は失敗しても例外を投げず、モデルに読ませる文を返す */
export type AgentTool = AgentToolSpec & Readonly<{ run: (args: unknown) => Promise<string> }>;

export type AgentToolInvocation = Readonly<{ name: string; arguments: unknown; result: string }>;

export type AgentLoopInput = Readonly<{
  model: AiModelName;
  system: string;
  input: string;
  tools: readonly AgentTool[];
  /** maxSteps 回で終わらなかったとき、最後の 1 回だけ使わせるツール（返信や投稿など、結果を外に出すもの） */
  finalTools?: readonly AgentTool[];
  maxSteps: number;
  maxOutputTokens: number;
}>;

export type AgentLoopResult = Readonly<{
  answer: string | undefined;
  invocations: readonly AgentToolInvocation[];
}>;

/** 1 回の応答で実行するツールの呼び出しの上限。モデルが同じ呼び出しを大量に並べたときに備える */
export const MAX_TOOL_CALLS_PER_STEP = 4;

/** ツールの結果をモデルに渡すときの文字数の上限 */
export const MAX_TOOL_RESULT_CHARS = 6000;

export const FINAL_STEP_INSTRUCTION =
  'これ以上は調べられません。ここまでに分かったことだけで仕上げてください。';

const truncate = (text: string, max: number): string => text.length <= max ? text : `${text.slice(0, max)}\n…(省略)`;

const toSpecs = (tools: readonly AgentTool[]): AgentToolSpec[] =>
  tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

const runTool = async (tools: readonly AgentTool[], name: string, args: unknown): Promise<string> => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) return `エラー: ${name} というツールはありません。`;
  try {
    return truncate(await tool.run(args), MAX_TOOL_RESULT_CHARS);
  } catch (error) {
    return `エラー: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/**
 * ツールを使うエージェントのループ。
 * モデルがツールを呼ぶ限り実行して結果を返し、ツールを呼ばずに答えたら終える。
 * maxSteps 回で終わらなければ、finalTools だけを渡してもう 1 回だけ呼び、仕上げさせる。
 */
export const runAgentLoop = (chatModel: AgentChatModel) =>
async (
  { model, system, input, tools, finalTools = [], maxSteps, maxOutputTokens }: AgentLoopInput,
): RA<AgentLoopResult, AiError> => {
  const messages: AgentMessage[] = [{ role: 'system', content: system }, { role: 'user', content: input }];
  const invocations: AgentToolInvocation[] = [];
  const specs = toSpecs(tools);

  const runCalls = async (available: readonly AgentTool[], toolCalls: readonly AgentToolCall[]) => {
    for (const call of toolCalls) {
      const result = await runTool(available, call.name, call.arguments);
      invocations.push({ name: call.name, arguments: call.arguments, result });
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result });
    }
  };

  for (let step = 0; step < maxSteps; step++) {
    const response = await chatModel.chat({ model, messages, tools: specs, maxOutputTokens });
    if (!response.ok) return response;
    const toolCalls = response.val.toolCalls.slice(0, MAX_TOOL_CALLS_PER_STEP);
    if (toolCalls.length === 0) return RA.ok({ answer: response.val.content, invocations });

    messages.push({ role: 'assistant', content: response.val.content ?? '', toolCalls });
    await runCalls(tools, toolCalls);
  }

  messages.push({ role: 'user', content: FINAL_STEP_INSTRUCTION });
  const final = await chatModel.chat({ model, messages, tools: toSpecs(finalTools), maxOutputTokens });
  if (!final.ok) return final;
  const finalCalls = final.val.toolCalls.slice(0, MAX_TOOL_CALLS_PER_STEP);
  await runCalls(finalTools, finalCalls);
  return RA.ok({ answer: finalCalls.length === 0 ? final.val.content : undefined, invocations });
};
