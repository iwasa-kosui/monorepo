export const toD1DomainEventRow = (
  event: Readonly<{
    eventId: string;
    aggregateId: unknown;
    aggregateName: string;
    aggregateState: unknown;
    eventName: string;
    eventPayload: unknown;
    occurredAt: number;
  }>,
) => ({
  eventId: event.eventId,
  aggregateId: JSON.stringify(event.aggregateId),
  aggregateName: event.aggregateName,
  aggregateState: event.aggregateState === undefined ? null : JSON.stringify(event.aggregateState),
  eventName: event.eventName,
  eventPayload: JSON.stringify(event.eventPayload),
  occurredAt: new Date(event.occurredAt),
});
