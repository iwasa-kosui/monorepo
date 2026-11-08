import type { CollectBlueskyTimelineUseCase } from './collectBlueskyTimeline.ts';
import type { ExpireBlueskyTimelineUseCase } from './expireBlueskyTimeline.ts';

export type RefreshBlueskyTimelineUseCase = CollectBlueskyTimelineUseCase;

type Deps = Readonly<{
  collect: CollectBlueskyTimelineUseCase;
  expire: ExpireBlueskyTimelineUseCase;
}>;

const create = ({ collect, expire }: Deps): RefreshBlueskyTimelineUseCase => ({
  run: async () => {
    const collected = await collect.run();
    await expire.run();
    return collected;
  },
});

export const RefreshBlueskyTimelineUseCase = {
  create,
} as const;
