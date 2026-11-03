import { RA } from '@iwasa-kosui/result';

import { htmlToPlainText } from '../adaptor/text/htmlToPlainText.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type {
  OwnLikeContentsResolverByActorId,
  OwnPostContentsResolverByActorId,
} from '../domain/interestSource/interestMaterial.ts';
import type {
  InterestSourceContentChangedStore,
  InterestSourceCreatedStore,
  InterestSourceDeletedStore,
  InterestSourceKind,
  InterestSourceParseError,
  InterestSourcesResolverByUserIdAndKindIncludingDeleted,
} from '../domain/interestSource/interestSource.ts';
import { type DesiredInterestSource, InterestSourceDiff } from '../domain/interestSource/interestSourceDiff.ts';
import type { UserNotFoundError } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { sha256Hex } from '../helper/sha256.ts';
import { applyInterestSourceDiff } from './helper/applyInterestSourceDiff.ts';
import { resolveLocalActorWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

export const OWN_INTEREST_TEXT_MAX_CHARS = 2000;

type Input = Readonly<{ userId: UserId }>;

type Ok = Readonly<{ created: number; changed: number; deleted: number }>;

type Err = UserNotFoundError | InterestSourceParseError;

export type SyncOwnInterestSourcesUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverByUserId: ActorResolverByUserId;
  ownPostContentsResolverByActorId: OwnPostContentsResolverByActorId;
  ownLikeContentsResolverByActorId: OwnLikeContentsResolverByActorId;
  interestSourcesResolverByUserIdAndKindIncludingDeleted: InterestSourcesResolverByUserIdAndKindIncludingDeleted;
  interestSourceCreatedStore: InterestSourceCreatedStore;
  interestSourceContentChangedStore: InterestSourceContentChangedStore;
  interestSourceDeletedStore: InterestSourceDeletedStore;
  now: () => Instant;
}>;

type Material = Readonly<{ ref: string; content: string; createdAt: Instant }>;

const toDesired = async (materials: ReadonlyArray<Material>): Promise<DesiredInterestSource[]> => {
  const desired = await Promise.all(
    materials.map(async ({ ref, content, createdAt }): Promise<DesiredInterestSource[]> => {
      const text = htmlToPlainText(content, OWN_INTEREST_TEXT_MAX_CHARS);
      return text === '' ? [] : [{ ref, contentHash: await sha256Hex(text), occurredAt: createdAt }];
    }),
  );
  return desired.flat();
};

const create = ({
  actorResolverByUserId,
  ownPostContentsResolverByActorId,
  ownLikeContentsResolverByActorId,
  interestSourcesResolverByUserIdAndKindIncludingDeleted,
  interestSourceCreatedStore,
  interestSourceContentChangedStore,
  interestSourceDeletedStore,
  now,
}: Deps): SyncOwnInterestSourcesUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async ({ userId }: Input): RA<Ok, Err> => {
    const actor = await resolveLocalActor(userId);
    if (!actor.ok) return actor;
    const [posts, likes] = await Promise.all([
      ownPostContentsResolverByActorId.resolve(actor.val.id),
      ownLikeContentsResolverByActorId.resolve(actor.val.id),
    ]);
    const desiredByKind: ReadonlyArray<readonly [InterestSourceKind, DesiredInterestSource[]]> = [
      [
        'own_post',
        await toDesired(posts.val.map(({ postId, content, createdAt }) => ({
          ref: postId,
          content,
          createdAt,
        }))),
      ],
      [
        'own_like',
        await toDesired(likes.val.map(({ likeId, content, createdAt }) => ({
          ref: likeId,
          content,
          createdAt,
        }))),
      ],
    ];

    let created = 0;
    let changed = 0;
    let deleted = 0;
    for (const [kind, desired] of desiredByKind) {
      const existing = await interestSourcesResolverByUserIdAndKindIncludingDeleted.resolve({ userId, kind });
      const applied = await applyInterestSourceDiff(
        { interestSourceCreatedStore, interestSourceContentChangedStore, interestSourceDeletedStore, now },
        { userId, kind },
        InterestSourceDiff.compute(existing.val, desired),
      );
      if (!applied.ok) return applied;
      created += applied.val.created.length;
      changed += applied.val.changed.length;
      deleted += applied.val.deleted;
    }
    return RA.ok({ created, changed, deleted });
  };

  return { run };
};

export const SyncOwnInterestSourcesUseCase = {
  create,
} as const;
