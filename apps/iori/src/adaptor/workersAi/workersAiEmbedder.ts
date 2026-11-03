import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { AiError } from '../../ports/aiError.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';
import type { WorkersAiRunner } from './workersAiRunner.ts';

const responseSchema = z.object({ data: z.array(z.array(z.number())) });

const aiError = (message: string): AiError => ({ type: 'AiError', message });

export const createWorkersAiEmbedder = (ai: WorkersAiRunner): TextEmbedder => ({
  embed: async ({ model, texts }) => {
    if (texts.length === 0) return RA.ok([]);
    try {
      const raw = await ai.run(model, { text: texts });
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) return RA.err(aiError('Workers AI returned an unexpected embedding shape.'));
      if (parsed.data.data.length !== texts.length) {
        return RA.err(aiError(`Workers AI returned ${parsed.data.data.length} embeddings for ${texts.length} texts.`));
      }
      return RA.ok(parsed.data.data);
    } catch (error) {
      return RA.err(aiError(error instanceof Error ? error.message : String(error)));
    }
  },
});
