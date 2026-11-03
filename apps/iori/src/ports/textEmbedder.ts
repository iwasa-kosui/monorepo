import type { RA } from '@iwasa-kosui/result';

import type { AiError, AiModelName } from './aiError.ts';

export type EmbedRequest = Readonly<{ model: AiModelName; texts: readonly string[] }>;
export type TextEmbedder = Readonly<{ embed: (request: EmbedRequest) => RA<readonly (readonly number[])[], AiError> }>;
