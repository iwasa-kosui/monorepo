import type { RA } from '@iwasa-kosui/result';

import type { AiError, AiModelName } from './aiError.ts';

/** モデルに渡すツールの説明。parameters は JSON Schema の object */
export type AgentToolSpec = Readonly<{
  name: string;
  description: string;
  parameters: Readonly<{
    type: 'object';
    properties: Readonly<Record<string, Readonly<{ type: string; description: string }>>>;
    required: readonly string[];
  }>;
}>;

export type AgentToolCall = Readonly<{
  id: string;
  name: string;
  arguments: unknown;
}>;

export type AgentMessage =
  | Readonly<{ role: 'system' | 'user'; content: string }>
  | Readonly<{ role: 'assistant'; content: string; toolCalls: readonly AgentToolCall[]; reasoning?: string }>
  | Readonly<{ role: 'tool'; toolCallId: string; name: string; content: string }>;

/** 推論するモデルに、どれだけ考えさせるか。推論しないモデルには渡さない */
export type AgentReasoningEffort = 'none' | 'low' | 'high';

export type AgentChatRequest = Readonly<{
  model: AiModelName;
  messages: readonly AgentMessage[];
  tools: readonly AgentToolSpec[];
  maxOutputTokens: number;
  reasoningEffort?: AgentReasoningEffort;
}>;

export type AgentChatResponse = Readonly<{
  content: string | undefined;
  toolCalls: readonly AgentToolCall[];
  /** 推論するモデルが考えた内容。ツールを呼んだ続きを頼むとき、モデルへ返す */
  reasoning?: string;
}>;

/** ツールを呼び出せるチャットモデル */
export type AgentChatModel = Readonly<{
  chat: (request: AgentChatRequest) => RA<AgentChatResponse, AiError>;
}>;
