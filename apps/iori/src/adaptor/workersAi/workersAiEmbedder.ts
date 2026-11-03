import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { AiError } from '../../ports/aiError.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';
import type { WorkersAiRunner } from './workersAiRunner.ts';

const responseSchema = z.object({ data: z.array(z.array(z.number())) });

const aiError = (message: string): AiError => ({ type: 'AiError', message });

// Workers AI の埋め込みモデルは1回に渡せる件数に上限があるため分割する
const MAX_TEXTS_PER_RUN = 100;

export const createWorkersAiEmbedder = (ai: WorkersAiRunner): TextEmbedder => ({
  embed: async ({ model, texts }) => {
    if (texts.length === 0) return RA.ok([]);
    try {
      const embeddings: number[][] = [];
      for (let start = 0; start < texts.length; start += MAX_TEXTS_PER_RUN) {
        const chunk = texts.slice(start, start + MAX_TEXTS_PER_RUN);
        const raw = await ai.run(model, { text: chunk });
        const parsed = responseSchema.safeParse(raw);
        if (!parsed.success) return RA.err(aiError('Workers AI returned an unexpected embedding shape.'));
        if (parsed.data.data.length !== chunk.length) {
          return RA.err(
            aiError(`Workers AI returned ${parsed.data.data.length} embeddings for ${chunk.length} texts.`),
          );
        }
        embeddings.push(...parsed.data.data);
      }
      return RA.ok(embeddings);
    } catch (error) {
      return RA.err(aiError(error instanceof Error ? error.message : String(error)));
    }
  },
});
