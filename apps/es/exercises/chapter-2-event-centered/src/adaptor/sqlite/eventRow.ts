import type { AnyBusinessEvent } from '../../domain/aggregate/event.ts';

export type BusinessEventRow = readonly [
  eventAt: string,
  eventName: string,
  payload: string,
  targetId: string,
  targetType: string,
  targetState: string,
];

const from = (event: AnyBusinessEvent): BusinessEventRow => [
  event.eventAt.toISOString(),
  event.eventName,
  JSON.stringify(event.payload),
  event.targetId,
  event.targetType,
  JSON.stringify(event.targetState),
];

export const BusinessEventRow = { from } as const;
