import type { AnyAggregate, InferId, InferName, InferState } from './aggregate.ts';

export type BusinessEvent<TAggregate extends AnyAggregate, TEventName extends string, TPayload> = Readonly<{
  eventAt: Date;
  eventName: TEventName;
  payload: TPayload;
  targetId: InferId<TAggregate>;
  targetType: InferName<TAggregate>;
  targetState: InferState<TAggregate>;
}>;

export type AnyBusinessEvent = BusinessEvent<AnyAggregate, string, unknown>;

const createFactory = <TAggregate extends AnyAggregate>(targetType: InferName<TAggregate>) => ({
  create: <TEventName extends string, TPayload>(
    targetId: InferId<TAggregate>,
    targetState: InferState<TAggregate>,
    eventName: TEventName,
    payload: TPayload,
    now: Date,
  ): BusinessEvent<TAggregate, TEventName, TPayload> => ({
    eventAt: now,
    eventName,
    payload,
    targetId,
    targetType,
    targetState,
  }),
});

export const BusinessEvent = { createFactory } as const;
