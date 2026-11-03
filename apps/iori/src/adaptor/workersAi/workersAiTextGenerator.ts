import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { AiError } from '../../ports/aiError.ts';
import type { GenerateRequest, TextGenerator } from '../../ports/textGenerator.ts';
import type { WorkersAiRunner } from './workersAiRunner.ts';

const DOCUMENT_SEPARATOR = '\n\n---\n\n';

const responseSchema = z.object({
  response: z.union([z.string(), z.array(z.unknown()), z.record(z.string(), z.unknown())]),
});
const choicesSchema = z.object({
  choices: z.tuple([
    z.object({
      message: z.object({ content: z.string().nullable(), reasoning_content: z.string().nullish() }),
    }),
  ], z.unknown()),
});

const aiError = (message: string): AiError => ({ type: 'AiError', message });

type ChoiceMessage = z.infer<typeof choicesSchema>['choices'][0]['message'];

const readChoiceMessage = (raw: unknown): ChoiceMessage | undefined => {
  const choices = choicesSchema.safeParse(raw);
  return choices.success ? choices.data.choices[0].message : undefined;
};

const extractText = (raw: unknown, message: ChoiceMessage | undefined): string | undefined => {
  const direct = responseSchema.safeParse(raw);
  if (direct.success) {
    const { response } = direct.data;
    const text = typeof response === 'string' ? response : JSON.stringify(response);
    if (text.length > 0) return text;
  }
  const content = message?.content ?? null;
  if (content !== null && content.length > 0) return content;
  return undefined;
};

const hasOnlyReasoning = (message: ChoiceMessage | undefined): boolean => {
  const reasoning = message?.reasoning_content;
  return reasoning !== undefined && reasoning !== null && reasoning.length > 0;
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
      const message = readChoiceMessage(raw);
      const text = extractText(raw, message);
      if (text !== undefined) return RA.ok(text);
      return RA.err(
        aiError(
          hasOnlyReasoning(message) ? 'Workers AI returned only reasoning content.' : 'Workers AI returned no text.',
        ),
      );
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
