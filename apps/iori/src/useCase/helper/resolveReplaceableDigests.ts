import { Article, type ArticleResolver } from '../../domain/article/article.ts';
import type { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import {
  type DigestHeader,
  type DigestHeadersResolverByUserIdAndDigestDate,
  SUMMARY_DIGEST_TOPIC_KEY,
} from '../../domain/digest/digest.ts';
import type { UserId } from '../../domain/user/userId.ts';

export type ReplaceableDigests = Readonly<{
  existing: ReadonlyArray<DigestHeader>;
  replaceable: ReadonlyArray<DigestHeader>;
  kept: ReadonlyArray<DigestHeader>;
  blockedBy: 'published' | 'edited' | undefined;
  missingArticleId: ArticleId | undefined;
}>;

type Deps = Readonly<{
  digestHeadersResolverByUserIdAndDigestDate: DigestHeadersResolverByUserIdAndDigestDate;
  articleResolver: ArticleResolver;
  articleBodyResolver: ArticleBodyResolver;
}>;

export const resolveReplaceableDigests = async (
  { digestHeadersResolverByUserIdAndDigestDate, articleResolver, articleBodyResolver }: Deps,
  { userId, digestDate }: Readonly<{ userId: UserId; digestDate: string }>,
): Promise<ReplaceableDigests> => {
  const existing = (await digestHeadersResolverByUserIdAndDigestDate.resolve({ userId, digestDate })).val;
  const replaceable: DigestHeader[] = [];
  const kept: DigestHeader[] = [];
  let hasEditedDraft = false;
  let hasEditedSummary = false;
  let missingArticleId: ArticleId | undefined;
  for (const header of existing) {
    const article = (await articleResolver.resolve(header.articleId)).val;
    if (article === undefined) {
      missingArticleId ??= header.articleId;
      kept.push(header);
      continue;
    }
    if (article.status !== 'draft') {
      kept.push(header);
      continue;
    }
    const body = (await articleBodyResolver.resolve(header.articleId)).val;
    if (Article.isBodyEdited(article, body)) {
      hasEditedDraft = true;
      hasEditedSummary ||= header.topicKey === SUMMARY_DIGEST_TOPIC_KEY;
      kept.push(header);
      continue;
    }
    replaceable.push(header);
  }
  if (kept.some((header) => header.topicKey === SUMMARY_DIGEST_TOPIC_KEY)) {
    return {
      existing,
      replaceable: [],
      kept: existing,
      blockedBy: hasEditedSummary ? 'edited' : 'published',
      missingArticleId,
    };
  }
  const blockedBy = existing.length === 0 || replaceable.length > 0
    ? undefined
    : hasEditedDraft
    ? 'edited'
    : 'published';
  return { existing, replaceable, kept, blockedBy, missingArticleId };
};
