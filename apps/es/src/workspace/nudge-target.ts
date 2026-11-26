import { type FiredSignals, isMet, unmet } from './conditions';
import { replyGate } from './rules';
import type { Condition, GatesConfig, SignalName, SignalRef, TabDefinition } from './scenario';

export type NudgeSpec = { readonly tab: string } | { readonly selector: string };

export type NudgeContext = {
  readonly tabs: readonly Pick<TabDefinition, 'key' | 'kind'>[];
  readonly selected: string;
};

export const restoredKey = 'restored';

export const restoreSelector = '[data-restore]';

export const signalSelectors: Readonly<Partial<Record<SignalName, string>>> = {
  'sql:executed': '[data-playground="sql"] [data-role="run"]',
  'sql:target-shown': '[data-playground="sql"] [data-role="run"]',
  'tests:ran': '[data-role="run-tests"]',
  'tests:passed': '[data-role="run-tests"]',
  'code:run': '[data-run-file]:not([data-role="run-tests"]), [data-play] [data-role="run"]',
  'figure:step': '[data-before-record-figure] [data-action="next"]',
  'question:written': '[data-own-question] textarea',
};

export const unmetSignals = (fired: FiredSignals, condition: Condition): SignalRef[] => {
  if (isMet(fired, condition)) return [];
  if (typeof condition === 'string' || 'name' in condition) return [condition];
  const items = 'all' in condition ? condition.all : condition.any;
  return items.flatMap((item) => unmetSignals(fired, item));
};

export const nextSignals = (
  fired: FiredSignals,
  gates: GatesConfig | undefined,
  done: Condition | undefined,
): SignalRef[] => {
  if (gates !== undefined && !replyGate(gates, fired).ready) {
    return unmet(fired, gates.reply.requires).map((requirement) => requirement.signal);
  }
  return done === undefined ? [] : unmetSignals(fired, done);
};

export const nudgeSpecOf = (signal: SignalRef, context: NudgeContext): NudgeSpec | null => {
  const name = typeof signal === 'string' ? signal : signal.name;
  const key = typeof signal === 'string' ? undefined : signal.key;
  if (name === 'tab:selected') return key === undefined ? null : { tab: key };
  if (name === 'sql:executed' && key === restoredKey) return { selector: restoreSelector };
  if (name === 'log:detail-opened' || name === 'log:target-opened') {
    const logs = context.tabs.find((tab) => tab.kind === 'logs');
    return logs === undefined || logs.key === context.selected ? null : { tab: logs.key };
  }
  const selector = signalSelectors[name];
  return selector === undefined ? null : { selector };
};
