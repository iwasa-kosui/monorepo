import { RA } from '@iwasa-kosui/result';

import type { ArticleId } from '../domain/article/articleId.ts';
import {
  Digest,
  type DigestFeedback,
  type DigestItemFeedbackGivenStore,
  DigestItemNotFoundError,
  type DigestResolverByDigestItemId,
} from '../domain/digest/digest.ts';
import type { DigestItemId } from '../domain/digest/digestItemId.ts';
import type { FeedEntryEmbeddingResolverByFeedEntryId } from '../domain/feedEntry/feedEntry.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { EmbeddingDimensionsError } from '../domain/interestSource/embedding.ts';
import {
  InterestSource,
  type InterestSourceDeletedStore,
  type InterestSourceEmbeddingCopiedStore,
  type InterestSourceKind,
  type InterestSourceParseError,
  type InterestSourcesResolverByUserIdAndRefAndKinds,
} from '../domain/interestSource/interestSource.ts';
import type { UserId } from '../domain/user/userId.ts';
import { sha256Hex } from '../helper/sha256.ts';
import type { UseCase } from './useCase.ts';

const FEEDBACK_KINDS = ['feedback_positive', 'feedback_negative'] as const satisfies ReadonlyArray<
  InterestSourceKind
>;

const kindOf = (feedback: DigestFeedback): (typeof FEEDBACK_KINDS)[number] =>
  feedback === 'interested' ? 'feedback_positive' : 'feedback_negative';

type Input = Readonly<{ userId: UserId; digestItemId: DigestItemId; feedback: DigestFeedback }>;

type Ok = Readonly<{ articleId: ArticleId; feedback: DigestFeedback | null }>;

type Err = DigestItemNotFoundError | InterestSourceParseError | EmbeddingDimensionsError;

export type GiveDigestItemFeedbackUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  digestResolverByDigestItemId: DigestResolverByDigestItemId;
  feedEntryEmbeddingResolverByFeedEntryId: FeedEntryEmbeddingResolverByFeedEntryId;
  interestSourcesResolverByUserIdAndRefAndKinds: InterestSourcesResolverByUserIdAndRefAndKinds;
  interestSourceDeletedStore: InterestSourceDeletedStore;
  interestSourceEmbeddingCopiedStore: InterestSourceEmbeddingCopiedStore;
  digestItemFeedbackGivenStore: DigestItemFeedbackGivenStore;
  now: () => Instant;
}>;

const create = ({
  digestResolverByDigestItemId,
  feedEntryEmbeddingResolverByFeedEntryId,
  interestSourcesResolverByUserIdAndRefAndKinds,
  interestSourceDeletedStore,
  interestSourceEmbeddingCopiedStore,
  digestItemFeedbackGivenStore,
  now,
}: Deps): GiveDigestItemFeedbackUseCase => {
  const run = async ({ userId, digestItemId, feedback }: Input) => {
    const resolved = await digestResolverByDigestItemId.resolve(digestItemId);
    const digest = resolved.val;
    if (digest === undefined || digest.userId !== userId) return RA.err(DigestItemNotFoundError.create(digestItemId));
    const item = digest.items.find((candidate) => candidate.digestItemId === digestItemId);
    if (item === undefined) return RA.err(DigestItemNotFoundError.create(digestItemId));

    const timestamp = now();
    const given = Digest.giveFeedback(digest, digestItemId, feedback, timestamp);
    if (!given.ok) return RA.err(given.err);
    const next = given.val.eventPayload.feedback;
    const targetKind = next === null ? undefined : kindOf(next);

    const existing = await interestSourcesResolverByUserIdAndRefAndKinds.resolve({
      userId,
      ref: item.url,
      kinds: FEEDBACK_KINDS,
    });
    const deleted = existing.val
      .filter((source) => source.deletedAt === null && source.kind !== targetKind)
      .map((source) => InterestSource.markDeleted(source, timestamp));
    if (deleted.length > 0) await interestSourceDeletedStore.store(...deleted);

    if (targetKind !== undefined) {
      const embedding = await feedEntryEmbeddingResolverByFeedEntryId.resolve(item.feedEntryId);
      if (embedding.val !== undefined) {
        const copied = InterestSource.copyEmbedding(
          existing.val.find((source) => source.kind === targetKind),
          {
            userId,
            kind: targetKind,
            ref: item.url,
            contentHash: await sha256Hex(item.url),
            occurredAt: timestamp,
            embedding: embedding.val,
          },
          timestamp,
        );
        if (!copied.ok) return RA.err(copied.err);
        await interestSourceEmbeddingCopiedStore.store(copied.val);
      }
    }

    await digestItemFeedbackGivenStore.store(given.val);
    return RA.ok<Ok>({ articleId: digest.articleId, feedback: next });
  };

  return { run };
};

export const GiveDigestItemFeedbackUseCase = { create } as const;
