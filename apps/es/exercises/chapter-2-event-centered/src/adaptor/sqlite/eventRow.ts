import type { AnyBusinessEvent } from '../../domain/aggregate/event.ts';

export const toBusinessEventRow = (event: AnyBusinessEvent) =>
  [
    event.eventAt.toISOString(),
    event.eventName,
    JSON.stringify(event.payload),
    event.targetId,
    event.targetType,
    JSON.stringify(event.targetState),
  ] as const;
