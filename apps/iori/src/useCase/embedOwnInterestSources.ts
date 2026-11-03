import { RA } from '@iwasa-kosui/result';

import { htmlToPlainText } from '../adaptor/text/htmlToPlainText.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type {
  LikedPostContentsResolverByLikeIds,
  PostContentsResolverByPostIds,
} from '../domain/interestSource/interestMaterial.ts';
import type {
  InterestSourceEmbeddedStore,
  InterestSourcesResolverByUserIdAndKindsPendingEmbedding,
} from '../domain/interestSource/interestSource.ts';
import { LikeId } from '../domain/like/likeId.ts';
import { PostId } from '../domain/post/postId.ts';
import type { UserId } from '../domain/user/userId.ts';
import { sha256Hex } from '../helper/sha256.ts';
import type { AiError } from '../ports/aiError.ts';
import type { TextEmbedder } from '../ports/textEmbedder.ts';
import { embedInterestSources, type EmbedTarget } from './helper/embedInterestSources.ts';
import { OWN_INTEREST_TEXT_MAX_CHARS } from './syncOwnInterestSources.ts';
import type { UseCase } from './useCase.ts';

export const OWN_EMBEDDING_BATCH_LIMIT = 100;

type Input = Readonly<{ userId: UserId }>;

type Ok = Readonly<{ embedded: number; skipped: number }>;

export type EmbedOwnInterestSourcesUseCase = UseCase<Input, Ok, AiError>;

type Deps = Readonly<{
  interestSourcesResolverByUserIdAndKindsPendingEmbedding: InterestSourcesResolverByUserIdAndKindsPendingEmbedding;
  postContentsResolverByPostIds: PostContentsResolverByPostIds;
  likedPostContentsResolverByLikeIds: LikedPostContentsResolverByLikeIds;
  interestSourceEmbeddedStore: InterestSourceEmbeddedStore;
  textEmbedder: TextEmbedder | undefined;
  now: () => Instant;
}>;

const create = ({
  interestSourcesResolverByUserIdAndKindsPendingEmbedding,
  postContentsResolverByPostIds,
  likedPostContentsResolverByLikeIds,
  interestSourceEmbeddedStore,
  textEmbedder,
  now,
}: Deps): EmbedOwnInterestSourcesUseCase => {
  const run = async ({ userId }: Input): RA<Ok, AiError> => {
    if (textEmbedder === undefined) return RA.ok({ embedded: 0, skipped: 0 });
    const pending = await interestSourcesResolverByUserIdAndKindsPendingEmbedding.resolve({
      userId,
      kinds: ['own_post', 'own_like'],
      limit: OWN_EMBEDDING_BATCH_LIMIT,
    });
    const rows = pending.val;
    const postRows = rows.filter((row) => row.kind === 'own_post');
    const likeRows = rows.filter((row) => row.kind === 'own_like');
    const [posts, likes] = await Promise.all([
      postContentsResolverByPostIds.resolve(postRows.map((row) => PostId.orThrow(row.ref))),
      likedPostContentsResolverByLikeIds.resolve(likeRows.map((row) => LikeId.orThrow(row.ref))),
    ]);
    const contentByRef = new Map<string, string>([
      ...posts.val.map(({ postId, content }) => [postId, content] as const),
      ...likes.val.map(({ likeId, content }) => [likeId, content] as const),
    ]);

    const targets: EmbedTarget[] = [];
    for (const source of rows) {
      const content = contentByRef.get(source.ref);
      if (content === undefined) continue;
      const text = htmlToPlainText(content, OWN_INTEREST_TEXT_MAX_CHARS);
      if (text === '' || await sha256Hex(text) !== source.contentHash) continue;
      targets.push({ source, text });
    }

    const embedded = await embedInterestSources({ textEmbedder, interestSourceEmbeddedStore, now }, targets);
    if (!embedded.ok) return embedded;
    return RA.ok({ embedded: embedded.val, skipped: rows.length - embedded.val });
  };

  return { run };
};

export const EmbedOwnInterestSourcesUseCase = {
  create,
} as const;
