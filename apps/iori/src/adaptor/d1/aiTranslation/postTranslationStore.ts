import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import { PostTranslation, type PostTranslationStore } from '../../../domain/aiTranslation/postTranslation.ts';
import type { IoriD1Db } from '../client.ts';
import { postTranslationsTable } from '../schema.ts';

export const createD1PostTranslationStore = (db: IoriD1Db): PostTranslationStore => ({
  find: async (postId, targetLanguage) => {
    const [row] = await db.select()
      .from(postTranslationsTable)
      .where(and(eq(postTranslationsTable.postId, postId), eq(postTranslationsTable.targetLanguage, targetLanguage)));
    return RA.ok(
      row === undefined ? undefined : PostTranslation.parseOrThrow({ ...row, createdAt: row.createdAt.getTime() }),
    );
  },
  save: async (translation) => {
    const { postId, targetLanguage, createdAt, ...rest } = translation;
    await db.insert(postTranslationsTable)
      .values({ postId, targetLanguage, createdAt: new Date(createdAt), ...rest })
      .onConflictDoUpdate({
        target: [postTranslationsTable.postId, postTranslationsTable.targetLanguage],
        set: { createdAt: new Date(createdAt), ...rest },
      });
    return RA.ok(undefined);
  },
});
