import type { RA } from '@iwasa-kosui/result';

import type { AiError, AiModelName } from './aiError.ts';

export type JudgeTopicRelevanceRequest = Readonly<{
  model: AiModelName;
  topic: Readonly<{ name: string; description: string }>;
  article: Readonly<{ title: string; excerpt: string }>;
}>;
export type TopicRelevanceJudge = Readonly<{
  judge: (request: JudgeTopicRelevanceRequest) => RA<Readonly<{ noul: number }>, AiError>;
}>;
