import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { AiError } from '../../ports/aiError.ts';
import type { GenerateRequest, TextGenerator } from '../../ports/textGenerator.ts';
import type { WorkersAiRunner } from './workersAiRunner.ts';

const DOCUMENT_SEPARATOR = '\n\n---\n\n';

const responseSchema = z.object({ response: z.string() });
const choicesSchema = z.object({
  choices: z.tuple([z.object({ message: z.object({ content: z.string() }) })], z.unknown()),
});

const aiError = (message: string): AiError => ({ type: 'AiError', message });

const extractText = (raw: unknown): string | undefined => {
  const direct = responseSchema.safeParse(raw);
  if (direct.success && direct.data.response.length > 0) return direct.data.response;
  const choices = choicesSchema.safeParse(raw);
  if (choices.success && choices.data.choices[0].message.content.length > 0) {
    return choices.data.choices[0].message.content;
  }
  return undefined;
};

export const createWorkersAiTextGenerator = (ai: WorkersAiRunner): TextGenerator => {
  const generate = async ({ model, instruction, input, maxOutputTokens }: GenerateRequest) => {
    if (input.length === 0) return RA.err(aiError('No input to generate from.'));
    try {
      const raw = await ai.run(model, {
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: input },
        ],
        max_tokens: maxOutputTokens,
      });
      const text = extractText(raw);
      return text === undefined ? RA.err(aiError('Workers AI returned no text.')) : RA.ok(text);
    } catch (error) {
      return RA.err(aiError(error instanceof Error ? error.message : String(error)));
    }
  };
  return {
    generate,
    summarize: async ({ model, instruction, documents, maxOutputTokens }) => {
      if (documents.length === 0) return RA.err(aiError('No documents to summarize.'));
      return generate({ model, instruction, input: documents.join(DOCUMENT_SEPARATOR), maxOutputTokens });
    },
  };
};
