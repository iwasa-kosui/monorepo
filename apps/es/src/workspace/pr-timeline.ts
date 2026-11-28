import type { Decision } from './choice';

export type PrEvent =
  | { readonly kind: 'request'; readonly option: string }
  | { readonly kind: 'commit'; readonly option: string | null }
  | { readonly kind: 'review'; readonly option: string; readonly state: 'changes-requested' | 'approved' };

export const prEventsOf = (decision: Decision, adopted: string): readonly PrEvent[] => {
  const waiting = decision.stage === 'reviewing';
  const events = decision.submitted.flatMap((option, index): PrEvent[] => {
    const last = index === decision.submitted.length - 1;
    const commit: PrEvent[] = index === 0 ? [] : [{ kind: 'commit', option }];
    const review: PrEvent[] = last && waiting
      ? []
      : [{ kind: 'review', option, state: option === adopted ? 'approved' : 'changes-requested' }];
    return [...commit, { kind: 'request', option }, ...review];
  });
  return decision.stage === 'approved' ? [...events, { kind: 'commit', option: null }] : events;
};
