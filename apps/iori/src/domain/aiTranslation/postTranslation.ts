import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';

const zodType = z
  .object({
    postId: PostId.zodType,
    targetLanguage: z.string().min(1),
    sourceHash: z.string().min(1),
    content: z.string(),
    detectedSourceLanguage: z.string().min(1),
    model: z.string().min(1),
    createdAt: Instant.zodType,
  })
  .describe('PostTranslation');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);

export type PostTranslation = z.output<typeof zodType>;
export const PostTranslation = { ...schema } as const;

export type PostTranslationStore = Readonly<{
  find: (postId: PostId, targetLanguage: string) => RA<PostTranslation | undefined, never>;
  save: (translation: PostTranslation) => RA<void, never>;
}>;
