import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  Marker,
  type MarkerSavedStore,
  type MarkersResolverByUserId,
  type MarkerTimeline,
} from '../domain/marker/marker.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  entries: ReadonlyArray<Readonly<{ timeline: MarkerTimeline; lastReadId: string }>>;
}>;

export type SaveMarkersUseCase = UseCase<Input, ReadonlyArray<Marker>, never>;

type Deps = Readonly<{
  markersResolverByUserId: MarkersResolverByUserId;
  markerSavedStore: MarkerSavedStore;
}>;

const create = ({ markersResolverByUserId, markerSavedStore }: Deps): SaveMarkersUseCase => {
  const run = async ({ userId, entries }: Input) => {
    const now = Instant.now();
    return RA.flow(
      markersResolverByUserId.resolve({ userId, timelines: entries.map((entry) => entry.timeline) }),
      RA.map((previous) =>
        entries.map(({ timeline, lastReadId }) =>
          Marker.save({ userId, timeline, lastReadId }, previous.find((marker) => marker.timeline === timeline), now)
        )
      ),
      RA.andThrough((events) => events.length === 0 ? RA.ok(undefined) : markerSavedStore.store(...events)),
      RA.map((events) => events.map((event) => event.aggregateState)),
    );
  };

  return { run };
};

export const SaveMarkersUseCase = { create } as const;
