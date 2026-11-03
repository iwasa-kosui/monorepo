import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';

const timelineZodType = z.enum(['home', 'notifications']).describe('MarkerTimeline');
export type MarkerTimeline = z.output<typeof timelineZodType>;
export const MarkerTimeline = Schema.create<MarkerTimeline, string>(timelineZodType);

const zodType = z
  .object({
    userId: UserId.zodType,
    timeline: timelineZodType,
    lastReadId: z.string().min(1),
    version: z.number().int().nonnegative(),
    updatedAt: Instant.zodType,
  })
  .describe('Marker');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type Marker = z.output<typeof zodType>;

export type MarkerAggregateId = Readonly<{
  userId: UserId;
  timeline: MarkerTimeline;
}>;
export type MarkerAggregate = Agg.Aggregate<MarkerAggregateId, 'marker', Marker>;
const toAggregateId = (marker: Marker): MarkerAggregateId => ({
  userId: marker.userId,
  timeline: marker.timeline,
});

type MarkerEvent<
  TAggregateState extends Agg.InferState<MarkerAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<MarkerAggregate, TAggregateState, TEventName, TEventPayload>;
const MarkerEvent = AggregateEvent.createFactory<MarkerAggregate>('marker');

export type MarkerSaved = MarkerEvent<Marker, 'marker.markerSaved', Marker>;

const save = (
  input: Readonly<{ userId: UserId; timeline: MarkerTimeline; lastReadId: string }>,
  previous: Marker | undefined,
  now: Instant,
): MarkerSaved => {
  const marker = schema.orThrow({
    ...input,
    version: (previous?.version ?? 0) + 1,
    updatedAt: now,
  });
  return MarkerEvent.create(toAggregateId(marker), marker, 'marker.markerSaved', marker, now);
};

export type MarkerSavedStore = Agg.Store<MarkerSaved>;
export type MarkersResolverByUserId = Agg.Resolver<
  Readonly<{ userId: UserId; timelines: ReadonlyArray<MarkerTimeline> }>,
  ReadonlyArray<Marker>
>;

export const Marker = {
  ...schema,
  save,
  toAggregateId,
} as const;
