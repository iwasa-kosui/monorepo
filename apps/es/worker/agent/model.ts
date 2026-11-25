import { agentLimits, type AgentMove, type AgentRequest } from '../../src/playground/agent-protocol.ts';
import type { AiBinding } from './env.ts';
import { buildMessages } from './prompt.ts';

export const agentModel = '@cf/deepseek-ai/deepseek-v4.1-flash-1017';

const messageProperty = { message: { type: 'string', description: '参加者への短い説明。日本語で書く' } };

const tools = [
  {
    type: 'function',
    function: {
      name: 'say',
      description: '参加者に説明を伝えて、この回を終える。コードは変えない',
      parameters: {
        type: 'object',
        properties: messageProperty,
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_visits',
      description: 'visits.ts の全文を置き換える。差分や省略は使わない',
      parameters: {
        type: 'object',
        properties: {
          ...messageProperty,
          code: { type: 'string', description: '新しい visits.ts の全文' },
        },
        required: ['message', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description: 'テストを実行して、結果を次の回に受け取る',
      parameters: {
        type: 'object',
        properties: messageProperty,
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: '作業を終えて、参加者に結果を伝える',
      parameters: {
        type: 'object',
        properties: messageProperty,
        required: ['message'],
      },
    },
  },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseArguments = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(raw) ? raw : {};
};

type Call = Readonly<{ name: string; args: Record<string, unknown> }>;

const callOf = (value: unknown): Call | null => {
  if (!isRecord(value)) {
    return null;
  }
  const fn = isRecord(value['function']) ? value['function'] : value;
  const name = fn['name'];
  return typeof name === 'string' ? { name, args: parseArguments(fn['arguments']) } : null;
};

const stripThinking = (content: string): string => content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();

const readReply = (raw: unknown): Readonly<{ content: string; calls: readonly Call[] }> => {
  if (!isRecord(raw)) {
    return { content: '', calls: [] };
  }
  const choice = Array.isArray(raw['choices']) ? raw['choices'][0] : undefined;
  const source = isRecord(choice) && isRecord(choice['message']) ? choice['message'] : raw;
  const content = source['content'] ?? source['response'];
  const rawCalls = Array.isArray(source['tool_calls']) ? source['tool_calls'] as unknown[] : [];
  return {
    content: typeof content === 'string' ? stripThinking(content) : '',
    calls: rawCalls.flatMap((call) => callOf(call) ?? []),
  };
};

const clip = (text: string): string => text.trim().slice(0, agentLimits.moveTextChars);

const textArgument = (call: Call, fallback: string): string => {
  const message = call.args['message'];
  return clip(typeof message === 'string' && message.trim() !== '' ? message : fallback);
};

export const moveOf = (raw: unknown): AgentMove | null => {
  const { content, calls } = readReply(raw);
  for (const call of calls) {
    switch (call.name) {
      case 'say':
      case 'finish': {
        const text = textArgument(call, content);
        if (text !== '') {
          return { kind: call.name === 'say' ? 'message' : 'done', text };
        }
        break;
      }
      case 'run_tests':
        return { kind: 'run_tests', text: textArgument(call, content) };
      case 'replace_visits': {
        const code = call.args['code'];
        if (typeof code === 'string' && code.trim() !== '' && code.length <= agentLimits.visitsChars) {
          return { kind: 'replace', text: textArgument(call, content), code };
        }
        break;
      }
    }
  }
  const text = clip(content);
  return calls.length === 0 && text !== '' ? { kind: 'message', text } : null;
};

export const askModel = async (ai: AiBinding, request: AgentRequest): Promise<AgentMove | null> =>
  moveOf(
    await ai.run(agentModel, {
      messages: buildMessages(request),
      tools,
      max_tokens: agentLimits.maxOutputTokens,
      temperature: 0.2,
      reasoning_effort: 'low',
    }),
  );
