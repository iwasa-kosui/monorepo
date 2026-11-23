import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { AgentChatModel, AgentMessage, AgentToolCall } from '../../ports/agentChatModel.ts';
import type { AiError } from '../../ports/aiError.ts';
import type { WorkersAiRunner } from './workersAiRunner.ts';

const aiError = (message: string): AiError => ({ type: 'AiError', message });

const parseArguments = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/** Workers AI 独自の形: { response, tool_calls: [{ name, arguments }] } */
const nativeSchema = z.object({
  response: z.unknown().optional(),
  tool_calls: z.array(z.object({ id: z.string().optional(), name: z.string(), arguments: z.unknown().optional() }))
    .optional(),
});

/** OpenAI 互換の形: { choices: [{ message: { content, tool_calls: [{ id, function: { name, arguments } }] } }] } */
const choicesSchema = z.object({
  choices: z.tuple([
    z.object({
      message: z.object({
        content: z.string().nullish(),
        reasoning: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        tool_calls: z.array(z.object({
          id: z.string().optional(),
          function: z.object({ name: z.string(), arguments: z.unknown().optional() }),
        })).nullish(),
      }),
    }),
  ], z.unknown()),
});

const toolCallId = (index: number, id: string | undefined): string => id ?? `call_${index}`;

/**
 * 推論するモデルが本文に混ぜた考えの部分（<think>…</think>）を取り除く。
 * 考えを本文に書いてくるモデルでも、考えが投稿されないようにする。
 */
export const stripThinking = (content: string): string => content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();

const readResponse = (
  raw: unknown,
): Readonly<{ content: string | undefined; toolCalls: AgentToolCall[]; reasoning: string | undefined }> => {
  const choices = choicesSchema.safeParse(raw);
  if (choices.success) {
    const message = choices.data.choices[0].message;
    const reasoning = message.reasoning ?? message.reasoning_content ?? undefined;
    return {
      content: message.content === null || message.content === undefined ? undefined : stripThinking(message.content),
      reasoning: reasoning === undefined || reasoning.trim().length === 0 ? undefined : reasoning,
      toolCalls: (message.tool_calls ?? []).map((call, index) => ({
        id: toolCallId(index, call.id),
        name: call.function.name,
        arguments: parseArguments(call.function.arguments),
      })),
    };
  }
  const native = nativeSchema.safeParse(raw);
  if (native.success) {
    const { response } = native.data;
    return {
      reasoning: undefined,
      content: typeof response === 'string'
        ? stripThinking(response)
        : response === undefined || response === null
        ? undefined
        : JSON.stringify(response),
      toolCalls: (native.data.tool_calls ?? []).map((call, index) => ({
        id: toolCallId(index, call.id),
        name: call.name,
        arguments: parseArguments(call.arguments),
      })),
    };
  }
  return { content: undefined, toolCalls: [], reasoning: undefined };
};

const toWorkersAiMessage = (message: AgentMessage): Record<string, unknown> => {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return message.toolCalls.length === 0
        ? { role: 'assistant', content: message.content }
        : {
          role: 'assistant',
          content: message.content,
          ...(message.reasoning === undefined ? {} : { reasoning_content: message.reasoning }),
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
          })),
        };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, name: message.name, content: message.content };
  }
};

export const createWorkersAiAgentChatModel = (ai: WorkersAiRunner): AgentChatModel => ({
  chat: async ({ model, messages, tools, maxOutputTokens, reasoningEffort }) => {
    try {
      const raw = await ai.run(model, {
        messages: messages.map(toWorkersAiMessage),
        ...(tools.length === 0
          ? {}
          : {
            tools: tools.map((tool) => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.parameters },
            })),
          }),
        max_tokens: maxOutputTokens,
        ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
      });
      const { content, toolCalls, reasoning } = readResponse(raw);
      const text = content?.trim();
      if ((text === undefined || text.length === 0) && toolCalls.length === 0) {
        return RA.err(aiError('Workers AI returned neither text nor tool calls.'));
      }
      return RA.ok({
        content: text === undefined || text.length === 0 ? undefined : text,
        toolCalls,
        ...(reasoning === undefined ? {} : { reasoning }),
      });
    } catch (error) {
      return RA.err(aiError(error instanceof Error ? error.message : String(error)));
    }
  },
});
