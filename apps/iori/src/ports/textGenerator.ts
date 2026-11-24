import type { RA } from '@iwasa-kosui/result';

import type { AiError, AiModelName } from './aiError.ts';

export type ReasoningEffort = 'none' | 'low' | 'high' | 'max';
export type SummarizeRequest = Readonly<
  {
    model: AiModelName;
    instruction: string;
    documents: readonly string[];
    maxOutputTokens: number;
    reasoningEffort: ReasoningEffort;
  }
>;
export type GenerateRequest = Readonly<
  {
    model: AiModelName;
    instruction: string;
    input: string;
    maxOutputTokens: number;
    reasoningEffort: ReasoningEffort;
  }
>;
export type TextGenerator = Readonly<{
  summarize: (request: SummarizeRequest) => RA<string, AiError>;
  generate: (request: GenerateRequest) => RA<string, AiError>;
}>;
