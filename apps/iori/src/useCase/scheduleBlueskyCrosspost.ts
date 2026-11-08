import { RA, Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import {
  BlueskyCrosspost,
  type BlueskyCrosspostResolver,
  type BlueskyCrosspostSavedStore,
} from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { LocalPostResolverByUri, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { resolveBlueskyReplyContextWith } from './helper/blueskyReplyContext.ts';
import type { SendBlueskyCrosspostUseCase } from './sendBlueskyCrosspost.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ postId: PostId }>;

export type ScheduleBlueskyCrosspostOutcome = 'pending' | 'skipped' | 'noop' | 'error';

export type ScheduleBlueskyCrosspostUseCase = UseCase<Input, ScheduleBlueskyCrosspostOutcome, never>;

type Deps = Readonly<{
  postResolver: PostResolver;
  localPostResolverByUri: LocalPostResolverByUri;
  crosspostResolver: BlueskyCrosspostResolver;
  crosspostSavedStore: BlueskyCrosspostSavedStore;
  send: SendBlueskyCrosspostUseCase;
  waitUntil: (promise: Promise<unknown>) => void;
  now: () => Instant;
}>;

const create = (deps: Deps): ScheduleBlueskyCrosspostUseCase => {
  const resolveReplyContext = resolveBlueskyReplyContextWith(deps);

  const execute = async ({ postId }: Input): Promise<ScheduleBlueskyCrosspostOutcome> => {
    const post = Result.unsafeUnwrap(await deps.postResolver.resolve(postId));
    if (post === undefined || post.type !== 'local') return 'noop';
    if (Result.unsafeUnwrap(await deps.crosspostResolver.resolve(postId)) !== undefined) return 'noop';

    const now = deps.now();
    const replyTo = await resolveReplyContext(post);
    const skipReason = BlueskyCrosspost.decideSkip({ summary: post.summary, sensitive: post.sensitive, replyTo });
    if (skipReason !== undefined) {
      await deps.crosspostSavedStore.save(BlueskyCrosspost.skipped(postId, skipReason, now));
      return 'skipped';
    }

    await deps.crosspostSavedStore.save(BlueskyCrosspost.pending(postId, now));
    deps.waitUntil(deps.send.run({ postId }));
    return 'pending';
  };

  const run = async (input: Input) => {
    try {
      return RA.ok(await execute(input));
    } catch (error) {
      getLogger().error(`Bluesky crosspost could not be scheduled: ${input.postId}`, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return RA.ok<ScheduleBlueskyCrosspostOutcome>('error');
    }
  };

  return { run };
};

export const ScheduleBlueskyCrosspostUseCase = { create } as const;
