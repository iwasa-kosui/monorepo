import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  Repost,
  type RepostDeletedStore,
  RepostNotFoundError,
  type RepostResolverByActivityUri,
} from '../domain/repost/repost.ts';
import {
  TimelineItem,
  type TimelineItemDeletedStore,
  type TimelineItemResolverByPostId,
} from '../domain/timeline/timelineItem.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  announceActivityUri: string;
}>;

type Ok = void;

type Err = RepostNotFoundError;

export type RemoveReceivedRepostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  repostDeletedStore: RepostDeletedStore;
  repostResolverByActivityUri: RepostResolverByActivityUri;
  timelineItemDeletedStore: TimelineItemDeletedStore;
  timelineItemResolverByPostId: TimelineItemResolverByPostId;
}>;

const create = ({
  repostDeletedStore,
  repostResolverByActivityUri,
  timelineItemDeletedStore,
  timelineItemResolverByPostId,
}: Deps): RemoveReceivedRepostUseCase => {
  const now = Instant.now();

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      // Resolve the repost
      RA.andBind('repost', async ({ announceActivityUri }) => {
        return RA.flow(
          repostResolverByActivityUri.resolve({ announceActivityUri }),
          RA.andThen((repost) => {
            if (repost === undefined) {
              return RA.err(RepostNotFoundError.create({ announceActivityUri }));
            }
            return RA.ok(repost);
          }),
        );
      }),
      // Delete the timeline item if it exists
      RA.andThrough(async ({ repost }) => {
        const timelineItem = await timelineItemResolverByPostId.resolve({
          postId: repost.postId,
        });
        if (timelineItem.ok && timelineItem.val) {
          const deletedEvent = TimelineItem.deleteTimelineItem(
            timelineItem.val.timelineItemId,
            now,
          );
          await timelineItemDeletedStore.store(deletedEvent);
        }
        return RA.ok(undefined);
      }),
      // Delete the repost
      RA.andThrough(async ({ repost }) => {
        const deletedEvent = Repost.deleteRepost(repost, now);
        return repostDeletedStore.store(deletedEvent);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const RemoveReceivedRepostUseCase = {
  create,
} as const;
