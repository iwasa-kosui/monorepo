import type { DatabaseSync } from 'node:sqlite';

export type Aggregate<TType extends string, TId extends string, TState> = Readonly<{
  type: TType;
  id: TId;
  state: TState;
}>;

export type AnyAggregate = Aggregate<string, string, unknown>;

export type BusinessEvent<TAggregate extends AnyAggregate, TEventName extends string, TPayload> = Readonly<{
  eventAt: Date;
  eventName: TEventName;
  payload: TPayload;
  targetId: TAggregate['id'];
  targetType: TAggregate['type'];
  targetState: TAggregate['state'];
}>;

export type AnyBusinessEvent = BusinessEvent<AnyAggregate, string, unknown>;

export const businessEventFactory = <TAggregate extends AnyAggregate>(targetType: TAggregate['type']) => ({
  create: <TEventName extends string, TPayload>(
    eventName: TEventName,
    payload: TPayload,
    target: Pick<TAggregate, 'id' | 'state'>,
    now: Date,
  ): BusinessEvent<TAggregate, TEventName, TPayload> => ({
    eventAt: now,
    eventName,
    payload,
    targetId: target.id,
    targetType,
    targetState: target.state,
  }),
});

export type Resolver<TCondition, TResolved> = Readonly<{
  resolve: (condition: TCondition) => TResolved;
}>;

export type Store<TEvent extends AnyBusinessEvent> = Readonly<{
  store: (event: TEvent) => void;
}>;

export const recordBusinessEvent = (db: DatabaseSync, event: AnyBusinessEvent): void => {
  db.prepare(`
    INSERT INTO business_events (event_at, event_name, payload, target_id, target_type, target_state)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    event.eventAt.toISOString(),
    event.eventName,
    JSON.stringify(event.payload),
    event.targetId,
    event.targetType,
    JSON.stringify(event.targetState),
  );
};
