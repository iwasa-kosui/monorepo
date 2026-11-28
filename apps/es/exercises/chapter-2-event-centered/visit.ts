import type { Aggregate, BusinessEvent } from './business-event.ts';
import { businessEventFactory } from './business-event.ts';

export type VisitState = Readonly<{
  id: string;
  pet_name: string;
  status: 'reserved' | 'checked_in' | 'completed' | 'cancelled';
}>;

export type Visit = Aggregate<'Visit', VisitState['id'], VisitState>;

export type VisitCancelled = BusinessEvent<
  Visit,
  'VisitCancelled',
  Readonly<{ reason: string; operatedBy: string }>
>;

const VisitEvent = businessEventFactory<Visit>('Visit');

export const Visit = {
  cancel: (
    visit: VisitState,
    input: Readonly<{ reason: string; operatedBy: string }>,
    now: Date,
  ): VisitCancelled => {
    if (visit.status === 'completed') {
      throw new Error('診察が終わった来院はキャンセルできません');
    }
    return VisitEvent.create(
      'VisitCancelled',
      { reason: input.reason, operatedBy: input.operatedBy },
      { id: visit.id, state: { ...visit, status: 'cancelled' } },
      now,
    );
  },
} as const;
