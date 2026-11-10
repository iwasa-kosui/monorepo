import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { AiError } from '../../ports/aiError.ts';
import type { TopicRelevanceJudge } from '../../ports/topicRelevanceJudge.ts';
import type { WorkersAiRunner } from './workersAiRunner.ts';

const responseSchema = z.object({
  answers: z.object({ topicRelevance: z.object({ noul: z.number().min(0).max(1) }) }),
});

const aiError = (message: string): AiError => ({ type: 'AiError', message });

export const createWorkersAiTopicRelevanceJudge = (ai: WorkersAiRunner): TopicRelevanceJudge => ({
  judge: async ({ model, topic, article }) => {
    try {
      const raw = await ai.run(model, {
        state: { title: article.title, excerpt: article.excerpt },
        questions: {
          topicRelevance: {
            type: 'noul',
            instructions:
              `この記事は、次のテーマについて述べているか。テーマの名前: ${topic.name}。テーマの説明: ${topic.description}`,
            criteria: {
              true: '記事の主題が、このテーマの名前と説明の範囲に入る。',
              false: '記事の主題が、このテーマの名前と説明の範囲に入らない。',
            },
          },
        },
      });
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) return RA.err(aiError('Workers AI returned an unexpected Jev answer shape.'));
      return RA.ok({ noul: parsed.data.answers.topicRelevance.noul });
    } catch (error) {
      return RA.err(aiError(error instanceof Error ? error.message : String(error)));
    }
  },
});
