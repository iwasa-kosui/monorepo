import type { Aggregate, Resolver, Store } from '../aggregate/aggregate.ts';
import type { BusinessEvent } from '../aggregate/event.ts';
import { AggregateEvent } from '../aggregate/event.ts';

export type Visit = Readonly<{
  id: string;
  pet_name: string;
  status: 'reserved' | 'checked_in' | 'completed' | 'cancelled';
}>;

export type VisitAggregate = Aggregate<Visit['id'], 'Visit', Visit>;

export type VisitCancelled = BusinessEvent<
  VisitAggregate,
  'VisitCancelled',
  Readonly<{ reason: string; operatedBy: string }>
>;

export type VisitResolver = Resolver<Visit['id'], Visit>;

export type VisitCancelledStore = Store<VisitCancelled>;

const VisitEvent = AggregateEvent.createFactory<VisitAggregate>('Visit');

const cancel = (
  visit: Visit,
  input: Readonly<{ reason: string; operatedBy: string }>,
  now: Date,
): VisitCancelled => {
  if (visit.status === 'completed') {
    throw new Error('診察が終わった来院はキャンセルできません');
  }
  return VisitEvent.create(
    visit.id,
    { ...visit, status: 'cancelled' },
    'VisitCancelled',
    { reason: input.reason, operatedBy: input.operatedBy },
    now,
  );
};

export const Visit = { cancel } as const;
